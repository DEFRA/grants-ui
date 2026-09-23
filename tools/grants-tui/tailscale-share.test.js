// @vitest-environment node
/* eslint-disable no-console */
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { spawnSync } from 'node:child_process'

import { createTailscaleShare, listTailscaleShares, revokeTailscaleShare } from './tailscale-share.js'
import { getTailscaleShareIds, saveTailscaleShareIds } from './cli-state.js'
import { getRunningAppBaseUrl, getRunningComposeFiles } from './docker.js'
import { getConnectedTailscaleNode } from './tailscale-serve.js'

vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }))
vi.mock('./cli-state.js', () => ({ getTailscaleShareIds: vi.fn(), saveTailscaleShareIds: vi.fn() }))
vi.mock('./docker.js', () => ({ getRunningAppBaseUrl: vi.fn(), getRunningComposeFiles: vi.fn() }))
vi.mock('./tailscale-serve.js', () => ({ getConnectedTailscaleNode: vi.fn() }))

const inviteUrl = 'https://login.tailscale.com/admin/invite/secret-code'
const jsonResponse = (value, status = 200) => new Response(JSON.stringify(value), { status })
const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform') ?? {
  configurable: true,
  value: process.platform
}
const successfulClipboardResult = { status: 0, stdout: '', stderr: '', pid: 1, output: [], signal: null }

function stubPlatform(platform) {
  Object.defineProperty(process, 'platform', { ...originalPlatform, value: platform })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('GRANTS_UI_TAILSCALE_API_KEY', 'tskey-api-test')
  vi.stubEnv('WSL_DISTRO_NAME', '')
  vi.stubEnv('WSL_INTEROP', '')
  vi.stubGlobal('fetch', vi.fn())
  vi.mocked(getRunningComposeFiles).mockReturnValue([
    'compose.infra.yml',
    'compose.grants-ui.yml',
    'compose.tailscale.yml'
  ])
  vi.mocked(getRunningAppBaseUrl).mockReturnValue('https://test.example.ts.net')
  vi.mocked(getConnectedTailscaleNode).mockReturnValue({ hostname: 'test.example.ts.net', nodeId: 'node-123' })
  vi.mocked(getTailscaleShareIds).mockReturnValue([])
  vi.mocked(spawnSync).mockReturnValue(successfulClipboardResult)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  Object.defineProperty(process, 'platform', originalPlatform)
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

test('creates a single-use non-exit-node invite and copies a tester message without logging its secret URL', async () => {
  stubPlatform('darwin')
  vi.mocked(fetch).mockResolvedValueOnce(jsonResponse([{ id: 'share-1', inviteUrl }]))

  await expect(createTailscaleShare()).resolves.toEqual({ id: 'share-1' })

  expect(fetch).toHaveBeenCalledWith(
    'https://api.tailscale.com/api/v2/device/node-123/device-invites',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify([{ multiUse: false, allowExitNode: false }]),
      headers: expect.objectContaining({ Authorization: 'Bearer tskey-api-test' })
    })
  )
  expect(spawnSync).toHaveBeenCalledWith(
    'pbcopy',
    [],
    expect.objectContaining({ input: expect.stringContaining(inviteUrl) })
  )
  expect(saveTailscaleShareIds).toHaveBeenCalledWith(['share-1'])
  expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining(inviteUrl))
})

test.each([
  ['Windows', 'win32', false, 'clip.exe', []],
  ['Linux Wayland', 'linux', false, 'wl-copy', []],
  ['WSL', 'linux', true, 'clip.exe', []]
])('copies the tester message on %s', async (_name, platform, isWsl, command, args) => {
  stubPlatform(platform)
  if (isWsl) {
    vi.stubEnv('WSL_DISTRO_NAME', 'Ubuntu')
  }
  vi.mocked(fetch).mockResolvedValueOnce(jsonResponse([{ id: 'share-1', inviteUrl }]))

  await expect(createTailscaleShare()).resolves.toEqual({ id: 'share-1' })

  expect(spawnSync).toHaveBeenCalledWith(
    command,
    args,
    expect.objectContaining({ input: expect.stringContaining(inviteUrl) })
  )
})

test('falls back from Wayland to X11 clipboard utilities on Linux', async () => {
  stubPlatform('linux')
  vi.mocked(fetch).mockResolvedValueOnce(jsonResponse([{ id: 'share-1', inviteUrl }]))
  vi.mocked(spawnSync)
    .mockReturnValueOnce({ ...successfulClipboardResult, error: new Error('ENOENT'), status: null })
    .mockReturnValueOnce({ ...successfulClipboardResult, status: 1 })

  await expect(createTailscaleShare()).resolves.toEqual({ id: 'share-1' })

  expect(vi.mocked(spawnSync).mock.calls.map(([command, args]) => [command, args])).toEqual([
    ['wl-copy', []],
    ['xclip', ['-selection', 'clipboard']],
    ['xsel', ['--clipboard', '--input']]
  ])
  expect(spawnSync).toHaveBeenNthCalledWith(
    3,
    'xsel',
    ['--clipboard', '--input'],
    expect.objectContaining({
      input: expect.stringContaining(inviteUrl)
    })
  )
})

test('revokes the invitation if no clipboard utility succeeds', async () => {
  stubPlatform('linux')
  vi.mocked(fetch)
    .mockResolvedValueOnce(jsonResponse([{ id: 'share-1', inviteUrl }]))
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
  vi.mocked(spawnSync).mockReturnValue({ ...successfulClipboardResult, error: new Error('ENOENT'), status: null })

  await expect(createTailscaleShare()).rejects.toThrow(/Could not copy the share message/)

  expect(fetch).toHaveBeenLastCalledWith(
    'https://api.tailscale.com/api/v2/device-invites/share-1',
    expect.objectContaining({ method: 'DELETE' })
  )
  expect(saveTailscaleShareIds).not.toHaveBeenCalled()
})

test('does not create a share without an API token', async () => {
  vi.stubEnv('GRANTS_UI_TAILSCALE_API_KEY', '')
  await expect(createTailscaleShare()).rejects.toThrow(/GRANTS_UI_TAILSCALE_API_KEY/)
  expect(fetch).not.toHaveBeenCalled()
})

test('lists only gt-created shares and never returns invite URLs', async () => {
  vi.mocked(getTailscaleShareIds).mockReturnValue(['share-1'])
  vi.mocked(fetch).mockResolvedValueOnce(
    jsonResponse([
      { id: 'share-1', inviteUrl, accepted: true, acceptedBy: { loginName: 'tester@example.com' } },
      { id: 'other-share', inviteUrl: 'https://secret.example', accepted: false }
    ])
  )

  await expect(listTailscaleShares()).resolves.toEqual([
    { id: 'share-1', created: undefined, accepted: true, acceptedBy: 'tester@example.com' }
  ])
})

test('revoking a managed share removes only its non-secret ID from local state', async () => {
  vi.mocked(getTailscaleShareIds)
    .mockReturnValueOnce(['share-1', 'share-2'])
    .mockReturnValueOnce(['share-1', 'share-2'])
  vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }))

  await expect(revokeTailscaleShare('share-1')).resolves.toBe(true)

  expect(fetch).toHaveBeenCalledWith(
    'https://api.tailscale.com/api/v2/device-invites/share-1',
    expect.objectContaining({ method: 'DELETE' })
  )
  expect(saveTailscaleShareIds).toHaveBeenCalledWith(['share-2'])
})

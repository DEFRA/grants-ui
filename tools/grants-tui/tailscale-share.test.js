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

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('GRANTS_UI_TAILSCALE_API_KEY', 'tskey-api-test')
  vi.stubGlobal('fetch', vi.fn())
  vi.mocked(getRunningComposeFiles).mockReturnValue([
    'compose.infra.yml',
    'compose.grants-ui.yml',
    'compose.tailscale.yml'
  ])
  vi.mocked(getRunningAppBaseUrl).mockReturnValue('https://test.example.ts.net')
  vi.mocked(getConnectedTailscaleNode).mockReturnValue({ hostname: 'test.example.ts.net', nodeId: 'node-123' })
  vi.mocked(getTailscaleShareIds).mockReturnValue([])
  vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: '', stderr: '', pid: 1, output: [], signal: null })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

test('creates a single-use non-exit-node invite and copies a tester message without logging its secret URL', async () => {
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

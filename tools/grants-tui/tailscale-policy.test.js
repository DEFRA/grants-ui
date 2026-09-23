// @vitest-environment node
/* eslint-disable no-console */
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import {
  mergeTailscaleSharingPolicy,
  previewTailscaleSharingPolicy,
  setupTailscaleSharingPolicy
} from './tailscale-policy.js'
import { getConnectedTailscalePolicyTarget } from './tailscale-serve.js'

vi.mock('./tailscale-serve.js', () => ({ getConnectedTailscalePolicyTarget: vi.fn() }))

const response = (value, status = 200, etag = 'policy-v1') =>
  new Response(JSON.stringify(value), { status, headers: { etag } })

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('GRANTS_UI_TAILSCALE_API_KEY', 'tskey-policy-test')
  vi.stubGlobal('fetch', vi.fn())
  vi.mocked(getConnectedTailscalePolicyTarget).mockReturnValue({ tailnet: 'example.com', ipv4: '100.121.112.23' })
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

test('merges only the host alias and restrictive grant, without duplicating it', () => {
  const policy = { groups: { 'group:developers': ['dev@example.com'] }, grants: [] }
  const first = mergeTailscaleSharingPolicy(policy, '100.121.112.23')
  const second = mergeTailscaleSharingPolicy(first.candidate, '100.121.112.23')

  expect(first.candidate).toEqual({
    groups: { 'group:developers': ['dev@example.com'] },
    hosts: { 'grants-ui-dev': '100.121.112.23' },
    grants: [{ src: ['autogroup:shared'], dst: ['grants-ui-dev'], ip: ['tcp:443', 'tcp:8443'] }]
  })
  expect(second.changes).toEqual([])
})

test('previews a policy change using a policy-write token and ETag', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(response({ hosts: {}, grants: [] }))

  const preview = await previewTailscaleSharingPolicy()

  expect(preview.changes).toHaveLength(2)
  expect(preview.etag).toBe('policy-v1')
  expect(fetch).toHaveBeenCalledWith(
    'https://api.tailscale.com/api/v2/tailnet/example.com/acl',
    expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer tskey-policy-test' }) })
  )
})

test('applies the previewed policy with If-Match so it cannot overwrite a newer policy', async () => {
  vi.mocked(fetch)
    .mockResolvedValueOnce(response({ hosts: {}, grants: [] }))
    .mockResolvedValueOnce(response({ hosts: { 'grants-ui-dev': '100.121.112.23' }, grants: [] }))

  await expect(setupTailscaleSharingPolicy(true)).resolves.toBe(0)

  expect(fetch).toHaveBeenLastCalledWith(
    'https://api.tailscale.com/api/v2/tailnet/example.com/acl',
    expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        'Content-Type': 'application/json',
        'If-Match': 'policy-v1'
      })
    })
  )
})

test('does not apply without an explicit confirmation', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(response({ hosts: {}, grants: [] }))

  await expect(setupTailscaleSharingPolicy()).resolves.toBe(0)

  expect(fetch).toHaveBeenCalledTimes(1)
  expect(console.log).toHaveBeenCalledWith('Preview only. Re-run with --apply to save this policy change.')
})

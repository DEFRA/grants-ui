// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { spawnSync } from 'node:child_process'
import {
  disableTailscaleServe,
  enableTailscaleServe,
  getTailscaleAvailability,
  getTailscaleHostname
} from './tailscale-serve.js'

vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }))

const hostname = 'test-machine.example.ts.net'
const result = (value = {}) => ({
  status: 0,
  stdout: JSON.stringify(value),
  stderr: '',
  pid: 1,
  output: [],
  signal: null
})
let config
let backendState
let failPort

function addProxy(port, target) {
  config.TCP ??= {}
  config.Web ??= {}
  config.TCP[port] = { HTTPS: true }
  config.Web[`${hostname}:${port}`] = { Handlers: { '/': { Proxy: target } } }
}

const mutations = () =>
  vi
    .mocked(spawnSync)
    .mock.calls.filter(([, args]) => args?.[0] === 'serve' && args[1] === '--bg')
    .map(([, args]) => args)

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  config = {}
  backendState = 'Running'
  failPort = null
  vi.mocked(spawnSync)
    .mockReset()
    .mockImplementation((bin, args = []) => {
      if (args[0] === 'status') {
        return result({ BackendState: backendState, Self: { DNSName: `${hostname}.` } })
      }
      if (args[1] === 'status') {
        return result(config)
      }
      const port = Number(args[2].split('=')[1])
      if (port === failPort && args[3] !== 'off') {
        return { ...result(), status: 1 }
      }
      if (args[3] !== 'off') {
        addProxy(port, args[3])
      }
      return result()
    })
})

afterEach(() => {
  vi.unstubAllEnvs()
  delete process.env.TAILSCALE_HOSTNAME
  vi.restoreAllMocks()
})

test('enable creates both HTTPS proxies; repeated enable is idempotent', () => {
  expect(enableTailscaleServe()).toEqual([443, 8443])
  expect(enableTailscaleServe()).toEqual([])
  expect(mutations()).toEqual([
    ['serve', '--bg', '--https=443', 'http://127.0.0.1:3000'],
    ['serve', '--bg', '--https=8443', 'http://127.0.0.1:3007']
  ])
})

test('disable adopts existing localhost proxies and preserves unrelated ports', () => {
  addProxy(443, 'http://localhost:3000')
  addProxy(8443, 'http://localhost:3007/')
  addProxy(9443, 'http://localhost:9000')
  expect(disableTailscaleServe()).toBe(0)
  expect(mutations()).toEqual([
    ['serve', '--bg', '--https=443', 'off'],
    ['serve', '--bg', '--https=8443', 'off']
  ])
})

test.each(['other-app', 'other-path', 'funnel', 'foreground', 'tcp'])(
  'rejects %s conflicts before altering either listener',
  (conflict) => {
    addProxy(8443, 'http://localhost:3007')
    const key = `${hostname}:8443`
    if (conflict === 'other-app') {
      config.Web[key].Handlers['/'].Proxy = 'http://localhost:9000'
    }
    if (conflict === 'other-path') {
      config.Web[key].Handlers['/other'] = { Text: 'other app' }
    }
    if (conflict === 'funnel') {
      config.AllowFunnel = { [key]: true }
    }
    if (conflict === 'foreground') {
      config.Foreground = { session: { TCP: { 8443: { HTTPS: true } } } }
    }
    if (conflict === 'tcp') {
      config.TCP[8443] = { TCPForward: 'localhost:9000' }
    }
    expect(() => enableTailscaleServe()).toThrow(/Tailscale port 8443/)
    expect(disableTailscaleServe()).toBe(1)
    expect(mutations()).toEqual([])
  }
)

test('rolls back only newly created listeners when the second listener fails', () => {
  failPort = 8443
  expect(() => enableTailscaleServe()).toThrow(/port 8443/)
  expect(mutations().at(-1)).toEqual(['serve', '--bg', '--https=443', 'off'])
})

test('does not remove a pre-existing first listener when the second fails', () => {
  addProxy(443, 'http://localhost:3000')
  failPort = 8443
  expect(() => enableTailscaleServe()).toThrow(/port 8443/)
  expect(mutations()).toEqual([['serve', '--bg', '--https=8443', 'http://127.0.0.1:3007']])
})

test('disconnected Tailscale blocks enable but still allows listener cleanup', () => {
  backendState = 'Stopped'
  addProxy(443, 'http://localhost:3000')
  expect(() => enableTailscaleServe()).toThrow(/Connect Tailscale/)
  expect(disableTailscaleServe()).toBe(0)
  expect(mutations()).toEqual([['serve', '--bg', '--https=443', 'off']])
})

test('dry-run previews enable and disable without executing Tailscale', () => {
  expect(enableTailscaleServe(true)).toEqual([443, 8443])
  expect(disableTailscaleServe(true)).toBe(0)
  expect(spawnSync).not.toHaveBeenCalled()
})

test('gets the hostname from the connected Tailscale CLI and makes it available to Compose', () => {
  expect(getTailscaleHostname()).toBe(hostname)
  expect(process.env.TAILSCALE_HOSTNAME).toBe(hostname)
})

test('rejects a missing DNS hostname from the CLI', () => {
  vi.mocked(spawnSync).mockImplementationOnce(() => result({ BackendState: 'Running', Self: {} }))
  expect(() => getTailscaleHostname()).toThrow(/Connect Tailscale/)
})

test('interactive availability distinguishes a missing CLI from a missing Tailscale service', () => {
  vi.mocked(spawnSync).mockReturnValueOnce({ ...result(), error: Object.assign(new Error(), { code: 'ENOENT' }) })
  expect(getTailscaleAvailability()).toEqual({ available: false, description: 'Install Tailscale CLI' })

  vi.mocked(spawnSync).mockReturnValueOnce({ ...result(), status: 1 })
  expect(getTailscaleAvailability()).toEqual({ available: false, description: 'Install Tailscale' })
})

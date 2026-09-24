/* eslint-disable no-console, curly */

import { spawnSync } from 'node:child_process'

const PROXIES = [
  { port: 443, target: 'http://127.0.0.1:3000' },
  { port: 8443, target: 'http://127.0.0.1:3007' }
]

export function getTailscaleHostname() {
  const hostname = getTailscaleStatus().Self?.DNSName?.replace(/\.$/, '')
  if (!hostname || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+\.ts\.net$/.test(hostname)) {
    throw new Error('Connect Tailscale so gt can determine this host’s full .ts.net hostname.')
  }
  // Docker Compose expands this only for the lifetime of this gt process; users
  // no longer need to copy a machine-specific address into .env.
  process.env.TAILSCALE_HOSTNAME = hostname
  return hostname
}

/** Return the local daemon status for callers that need the node identity. */
export function getTailscaleStatus() {
  return tailscaleJson(['status', '--json'])
}

/**
 * Get the connected node identity accepted by Tailscale's device-invites API.
 * The local CLI is the authority for which machine gt is currently serving.
 */
export function getConnectedTailscaleNode() {
  const status = getTailscaleStatus()
  const hostname = status.Self?.DNSName?.replace(/\.$/, '')
  const nodeId = status.Self?.ID ?? status.Self?.NodeID
  if (status.BackendState !== 'Running' || !hostname || !nodeId) {
    throw new Error('Connect Tailscale and retry.')
  }
  return { hostname, nodeId }
}

/**
 * Get the current tailnet name and IPv4 address for a narrowly-scoped policy
 * host alias. These come from the local daemon, not user input.
 */
export function getConnectedTailscalePolicyTarget() {
  const status = getTailscaleStatus()
  const tailnet = status.CurrentTailnet?.Name ?? status.TailnetName
  const ipv4 = status.TailscaleIPs?.find((ip) => /^100\./.test(String(ip)))
  if (status.BackendState !== 'Running' || !tailnet || !ipv4) {
    throw new Error('Connect Tailscale so gt can determine this tailnet and machine IPv4 address.')
  }
  return { tailnet, ipv4: String(ipv4) }
}

/** Check the local Tailscale service and CLI before drawing the interactive menu. */
export function getTailscaleAvailability() {
  const result = spawnSync('tailscale', ['status', '--json'], { encoding: 'utf8', timeout: 10000 })
  /** @type {NodeJS.ErrnoException | undefined} */
  const error = result.error
  if (error?.code === 'ENOENT') return { available: false, running: false, description: 'Install Tailscale CLI' }
  if (result.error || result.status !== 0) return { available: false, running: false, description: 'Install Tailscale' }
  const status = JSON.parse(result.stdout || '{}')
  return {
    available: true,
    running: status.BackendState === 'Running',
    description: status.BackendState === 'Running' ? '' : 'Connect Tailscale'
  }
}

function tailscaleJson(args) {
  const result = spawnSync('tailscale', args, { encoding: 'utf8', timeout: 10000 })
  if (result.error || result.status !== 0) {
    throw new Error(
      `tailscale ${args.join(' ')} failed: ${result.error?.message || result.stderr || 'check Tailscale is installed and running'}`
    )
  }
  return JSON.parse(result.stdout || '{}')
}

function serve(proxy, off, dryRun) {
  const args = ['serve', '--bg', `--https=${proxy.port}`, ...(off ? ['off'] : [proxy.target])]
  console.log(`tailscale ${args.join(' ')}`)
  if (dryRun) return
  const result = spawnSync('tailscale', args, { encoding: 'utf8', stdio: 'inherit', timeout: 20000 })
  if (result.error || result.status !== 0) {
    throw new Error(
      `Tailscale Serve failed on port ${proxy.port}. Check the output; enable HTTPS in your tailnet if prompted, then retry. DO NOT enable Tailscale Funnel!`
    )
  }
}

// Only adopt/remove a whole listener if it contains exactly our root proxy.
// Other paths, TCP forwarding, foreground sessions and Funnel are conflicts.
function proxyExists(config, hostname, proxy) {
  const key = `${hostname}:${proxy.port}`
  const web = config.Web?.[key]
  const tcp = config.TCP?.[proxy.port]
  const occupiedElsewhere = Object.keys(config.Web ?? {}).some((k) => k.endsWith(`:${proxy.port}`) && k !== key)
  const foreground = Object.values(config.Foreground ?? {}).some((c) => c.TCP?.[proxy.port])
  if (occupiedElsewhere || foreground || config.AllowFunnel?.[key]) {
    throw new Error(
      `Tailscale port ${proxy.port} is used by another Serve/Funnel configuration. Leave it unchanged and free that port before retrying.`
    )
  }
  if (!web && !tcp) return false
  const handlers = web?.Handlers ?? {}
  const handler = handlers['/']
  const target = handler?.Proxy?.replace('http://localhost:', 'http://127.0.0.1:').replace(/\/$/, '')
  if (
    !tcp?.HTTPS ||
    Object.keys(tcp).length !== 1 ||
    Object.keys(handlers).length !== 1 ||
    Object.keys(handler ?? {}).length !== 1 ||
    target !== proxy.target
  ) {
    throw new Error(
      `Tailscale port ${proxy.port} already serves something else. No existing Serve configuration was changed.`
    )
  }
  return true
}

/** Configure the two listeners, returning only newly created ports for rollback. */
export function enableTailscaleServe(dryRun = false) {
  const hostname = dryRun ? 'your-machine.your-tailnet.ts.net' : getTailscaleHostname()
  if (!dryRun) {
    const status = getTailscaleStatus()
    if (status.BackendState !== 'Running' || status.Self?.DNSName?.replace(/\.$/, '') !== hostname) {
      throw new Error('Connect Tailscale and retry.')
    }
  }
  const config = dryRun ? {} : tailscaleJson(['serve', 'status', '--json'])
  const missing = PROXIES.filter((proxy) => !proxyExists(config, hostname, proxy))
  const created = []
  try {
    for (const proxy of missing) {
      serve(proxy, false, dryRun)
      created.push(proxy.port)
    }
  } catch (error) {
    disableTailscaleServe(dryRun, created)
    throw error
  }
  console.log(`Tailscale: https://${hostname}`)
  return created
}

/** Remove matching listeners only; never reset the machine's Serve configuration. */
export function disableTailscaleServe(dryRun = false, ports = PROXIES.map((p) => p.port)) {
  if (!ports.length) return 0
  try {
    const hostname = dryRun ? 'your-machine.your-tailnet.ts.net' : getTailscaleHostname()
    const config = dryRun ? null : tailscaleJson(['serve', 'status', '--json'])
    const selected = PROXIES.filter((p) => ports.includes(p.port)).filter(
      (p) => config === null || proxyExists(config, hostname, p)
    )
    for (const proxy of selected) serve(proxy, true, dryRun)
    return 0
  } catch (error) {
    console.error(`Could not remove Tailscale proxies: ${error.message} Retry 'gt tailscale off' to finish cleanup.`)
    return 1
  }
}

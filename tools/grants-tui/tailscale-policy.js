/* eslint-disable no-console */

import { getConnectedTailscalePolicyTarget } from './tailscale-serve.js'
import { TAILSCALE_SHARE_API_KEY } from './tailscale-share.js'

const API_BASE_URL = 'https://api.tailscale.com/api/v2'
const HOST_ALIAS = 'grants-ui-dev'
const SHARE_GRANT = {
  src: ['autogroup:shared'],
  dst: [HOST_ALIAS],
  ip: ['tcp:443', 'tcp:8443']
}

function apiKey() {
  const key = process.env[TAILSCALE_SHARE_API_KEY]
  if (!key) {
    throw new Error(`Set ${TAILSCALE_SHARE_API_KEY} to a Tailscale API token before setting up sharing.`)
  }
  return key
}

function apiError(status, body) {
  let message = ''
  try {
    message = JSON.parse(body).message ?? ''
  } catch {
    message = body
  }
  return new Error(`Tailscale policy API returned ${status}${message ? `: ${String(message).slice(0, 240)}` : ''}`)
}

async function request(path, options = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        ...options.headers
      },
      signal: controller.signal
    })
    const body = await response.text()
    if (!response.ok) {
      if (response.status === 412) {
        throw new Error(
          'The Tailscale policy changed after preview. Run the setup command again to review the latest policy.'
        )
      }
      throw apiError(response.status, body)
    }
    return { body, etag: response.headers.get('etag') }
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Tailscale policy API timed out. Try again.')
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

function sameStrings(a, b) {
  return Array.isArray(a) && a.length === b.length && a.every((value, index) => value === b[index])
}

function isShareGrant(grant) {
  return (
    grant &&
    typeof grant === 'object' &&
    sameStrings(grant.src, SHARE_GRANT.src) &&
    sameStrings(grant.dst, SHARE_GRANT.dst) &&
    sameStrings(grant.ip, SHARE_GRANT.ip)
  )
}

/** Add the dedicated host and restrictive grant without altering unrelated policy values. */
export function mergeTailscaleSharingPolicy(policy, ipv4) {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    throw new Error('Tailscale returned an invalid policy document.')
  }
  if (
    policy.hosts !== undefined &&
    (!policy.hosts || typeof policy.hosts !== 'object' || Array.isArray(policy.hosts))
  ) {
    throw new Error('Tailscale policy hosts must be an object; gt will not replace it.')
  }
  if (policy.grants !== undefined && !Array.isArray(policy.grants)) {
    throw new Error('Tailscale policy grants must be an array; gt will not replace it.')
  }

  const candidate = structuredClone(policy)
  const changes = []
  candidate.hosts ??= {}
  if (candidate.hosts[HOST_ALIAS] !== ipv4) {
    changes.push(
      candidate.hosts[HOST_ALIAS]
        ? `Update host ${HOST_ALIAS}: ${candidate.hosts[HOST_ALIAS]} → ${ipv4}`
        : `Add host ${HOST_ALIAS}: ${ipv4}`
    )
    candidate.hosts[HOST_ALIAS] = ipv4
  }
  candidate.grants ??= []
  if (!candidate.grants.some(isShareGrant)) {
    candidate.grants.push(SHARE_GRANT)
    changes.push('Add autogroup:shared access to grants-ui-dev on TCP 443 and 8443')
  }
  return { candidate, changes }
}

/** Fetch the current policy and calculate the exact sharing-policy changes. */
export async function previewTailscaleSharingPolicy() {
  const { tailnet, ipv4 } = getConnectedTailscalePolicyTarget()
  const path = `/tailnet/${encodeURIComponent(tailnet)}/acl`
  const { body, etag } = await request(path, { headers: { Accept: 'application/json' } })
  if (!etag) {
    throw new Error(
      'Tailscale did not return a policy version. Refusing to risk overwriting a concurrent policy change.'
    )
  }
  let policy
  try {
    policy = JSON.parse(body)
  } catch {
    throw new Error('Tailscale returned a policy that gt could not parse.')
  }
  const { candidate, changes } = mergeTailscaleSharingPolicy(policy, ipv4)
  return { tailnet, ipv4, etag, candidate, changes }
}

/** Return whether the exact host and grant required for external sharing are already active. */
export async function getTailscaleSharingPolicyStatus() {
  const preview = await previewTailscaleSharingPolicy()
  return preview.changes.length === 0 ? 'active' : 'needs-setup'
}

/** Preview then, only when explicitly confirmed, atomically apply the narrow sharing policy. */
export async function setupTailscaleSharingPolicy(apply = false) {
  const preview = await previewTailscaleSharingPolicy()
  console.log(`Tailscale sharing policy preview for ${preview.tailnet}:`)
  if (!preview.changes.length) {
    console.log('Already configured: grants-ui-dev is restricted to shared users on TCP 443 and 8443.')
    return 0
  }
  for (const change of preview.changes) {
    console.log(`- ${change}`)
  }
  if (!apply) {
    console.log('Preview only. Re-run with --apply to save this policy change.')
    return 0
  }

  // The API validates policy syntax and existing policy tests before accepting
  // this POST; If-Match prevents applying a preview made against a stale policy.
  await request(`/tailnet/${encodeURIComponent(preview.tailnet)}/acl`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'If-Match': preview.etag
    },
    body: JSON.stringify(preview.candidate)
  })
  console.log('Tailscale sharing policy updated.')
  return 0
}

/** Run the deliberate non-interactive setup command. */
export async function cmdTailscaleSetup(args, dryRun = false) {
  if (args[0] !== 'tailscale-sharing') {
    throw new Error('Usage: gt setup tailscale-sharing [--apply] [--dry-run]')
  }
  return setupTailscaleSharingPolicy(args.includes('--apply') && !dryRun)
}

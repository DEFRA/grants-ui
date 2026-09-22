/* eslint-disable no-console */

import { spawnSync } from 'node:child_process'

import { getTailscaleShareIds, saveTailscaleShareIds } from './cli-state.js'
import { getRunningAppBaseUrl, getRunningComposeFiles } from './docker.js'
import { getConnectedTailscaleNode } from './tailscale-serve.js'

export const TAILSCALE_SHARE_API_KEY = 'GRANTS_UI_TAILSCALE_API_KEY'
const API_BASE_URL = 'https://api.tailscale.com/api/v2'

function apiKey() {
  const key = process.env[TAILSCALE_SHARE_API_KEY]
  if (!key) {
    throw new Error(`Set ${TAILSCALE_SHARE_API_KEY} to a Tailscale Admin API access token before sharing grants-ui.`)
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
  return new Error(`Tailscale Admin API returned ${status}${message ? `: ${String(message).slice(0, 240)}` : ''}`)
}

async function request(path, options = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers
      },
      signal: controller.signal
    })
    const body = await response.text()
    if (!response.ok) {
      throw apiError(response.status, body)
    }
    return body ? JSON.parse(body) : null
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Tailscale Admin API timed out. Try again.')
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

function assertShareableStack() {
  const files = getRunningComposeFiles()
  if (!files?.some((file) => file.endsWith('compose.tailscale.yml'))) {
    throw new Error('Start grants-ui with Tailscale mode enabled before creating a share.')
  }
  const appUrl = getRunningAppBaseUrl()
  if (!appUrl) {
    throw new Error('Grants UI is not running. Start the stack before creating a share.')
  }
  return appUrl
}

function copyText(text) {
  /** @type {[string, string[]]} */
  const command =
    process.platform === 'darwin' ? ['pbcopy', []] : process.platform === 'win32' ? ['clip', []] : ['wl-copy', []]
  const result = spawnSync(command[0], command[1], { input: text, encoding: 'utf8', timeout: 5000 })
  return !result.error && result.status === 0
}

/** Create, copy, and record a single-use device-share invitation. */
export async function createTailscaleShare(dryRun = false) {
  const appUrl = assertShareableStack()
  const { nodeId } = getConnectedTailscaleNode()
  if (dryRun) {
    console.log(`Would create a single-use Tailscale share for ${appUrl} and copy the tester message.`)
    return null
  }

  const invites = await request(`/device/${encodeURIComponent(nodeId)}/device-invites`, {
    method: 'POST',
    body: JSON.stringify([{ multiUse: false, allowExitNode: false }])
  })
  const invite = Array.isArray(invites) ? invites[0] : null
  if (!invite?.id || !invite.inviteUrl) {
    throw new Error('Tailscale did not return a usable share invitation.')
  }

  const testerMessage = `Accept this single-use Tailscale invitation, then open Grants UI:\n${invite.inviteUrl}\n\nGrants UI: ${appUrl}`
  if (!copyText(testerMessage)) {
    try {
      await request(`/device-invites/${encodeURIComponent(invite.id)}`, { method: 'DELETE' })
    } catch {
      // The original error is more useful; the invite remains revocable in the admin console.
    }
    throw new Error(
      'Could not copy the share message; no share was kept. Install a supported clipboard utility and retry.'
    )
  }

  saveTailscaleShareIds([...getTailscaleShareIds(), invite.id])
  console.log(`Created single-use share ${invite.id}. The tester message is copied to your clipboard.`)
  return { id: invite.id }
}

/** List only shares created by gt; invite URLs are intentionally omitted. */
export async function listTailscaleShares() {
  const ids = new Set(getTailscaleShareIds())
  if (!ids.size) {
    return []
  }
  const { nodeId } = getConnectedTailscaleNode()
  const invites = await request(`/device/${encodeURIComponent(nodeId)}/device-invites`)
  return (Array.isArray(invites) ? invites : [])
    .filter((invite) => ids.has(invite.id))
    .map((invite) => ({
      id: invite.id,
      created: invite.created,
      accepted: Boolean(invite.accepted),
      acceptedBy: invite.acceptedBy?.loginName ?? null
    }))
}

/** Revoke a gt-managed invitation or accepted share. */
export async function revokeTailscaleShare(id, dryRun = false) {
  if (!getTailscaleShareIds().includes(id)) {
    throw new Error(`Share ${id} was not created by gt.`)
  }
  if (dryRun) {
    console.log(`Would revoke Tailscale share ${id}.`)
    return true
  }
  await request(`/device-invites/${encodeURIComponent(id)}`, { method: 'DELETE' })
  saveTailscaleShareIds(getTailscaleShareIds().filter((shareId) => shareId !== id))
  console.log(`Revoked Tailscale share ${id}.`)
  return true
}

/** Revoke all shares created by gt, retaining any IDs that failed to revoke. */
export async function revokeAllTailscaleShares(dryRun = false) {
  const ids = getTailscaleShareIds()
  let failed = 0
  for (const id of ids) {
    try {
      await revokeTailscaleShare(id, dryRun)
    } catch (error) {
      failed++
      console.error(`Could not revoke Tailscale share ${id}: ${error.message}`)
    }
  }
  return failed === 0 ? 0 : 1
}

/**
 * Lifecycle commands are synchronous. Delegate their network cleanup to a
 * short-lived Node process so the API key stays in the environment, never argv.
 */
export function revokeAllTailscaleSharesSync(dryRun = false) {
  const ids = getTailscaleShareIds()
  if (!ids.length || dryRun) {
    return 0
  }
  const result = spawnSync(
    process.execPath,
    [new URL('./tailscale-share-worker.js', import.meta.url).pathname, 'revoke-all'],
    {
      encoding: 'utf8',
      timeout: 30000
    }
  )
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout || 'Could not revoke Tailscale shares.')
    return 1
  }
  return 0
}

/** Run a non-interactive share command. */
export async function cmdTailscaleShare(args, dryRun = false) {
  const [command, id] = args
  if (command === 'create') {
    await createTailscaleShare(dryRun)
    return 0
  }
  if (command === 'list') {
    const shares = await listTailscaleShares()
    if (!shares.length) {
      console.log('No active shares created by gt.')
    }
    for (const share of shares) {
      const recipient = share.acceptedBy ? ` · accepted by ${share.acceptedBy}` : ' · pending acceptance'
      console.log(`${share.id}${recipient}`)
    }
    return 0
  }
  if (command === 'revoke') {
    if (!id) {
      throw new Error('Usage: gt share revoke <share-id> [--dry-run]')
    }
    await revokeTailscaleShare(id, dryRun)
    return 0
  }
  if (command === 'revoke-all') {
    return revokeAllTailscaleShares(dryRun)
  }
  throw new Error('Usage: gt share create|list|revoke <share-id>|revoke-all [--dry-run]')
}

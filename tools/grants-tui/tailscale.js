/* eslint-disable no-console, curly */

import { ADDONS, BLUE, RESET_COLOR } from './constants.js'
import { loadState, saveState } from './cli-state.js'
import { getRunningComposeFiles, runCompose, tailscaleComposeArgs } from './docker.js'
import { getSelectedFormDefIds } from './form-defs.js'
import { disableTailscaleServe, enableTailscaleServe } from './tailscale-serve.js'

export function tailscaleEnabled(files) {
  return !!files?.some((f) => f.endsWith('compose.tailscale.yml'))
}

export function tailscaleStatusSegment(url) {
  return `${BLUE}Tailscale: ${url}${RESET_COLOR}`
}

function recreateAuthAndUi(args, dryRun) {
  // The UI caches OIDC discovery at startup, so wait for the stub first.
  for (const service of ['fcp-defra-id-stub', 'grants-ui']) {
    const status = runCompose([...args, 'up', '-d', '--no-deps', '--force-recreate', '--wait', service], dryRun)
    if (status !== 0) return status
  }
  return 0
}

/** Switch browser URLs without restarting dependencies or reapplying form definitions. */
export function cmdTailscale(enabled, dryRun = false) {
  const files = getRunningComposeFiles()
  const state = loadState()
  const currentAddons = files
    ? ADDONS.filter((a) => files.some((f) => f.endsWith(a.composeFile))).map((a) => a.key)
    : (state?.addons ?? [])
  if (enabled && currentAddons.includes('ha')) {
    console.error('Tailscale mode uses ports 3000 and 3007 and cannot be combined with the HA proxy.')
    return 1
  }
  const addons = currentAddons.filter((key) => key !== 'tailscale')
  if (enabled) addons.push('tailscale')
  const localServices = state?.localServices ?? []
  let created = []
  try {
    // Selecting the mode before startup only saves the choice. `up` configures Serve.
    if (files && enabled) created = enableTailscaleServe(dryRun)
    // Reapply even if the UI label already matches: an earlier partial failure
    // may have left the stub and UI using different discovery URLs.
    if (files) {
      const args = tailscaleComposeArgs(files, enabled, localServices)
      const status = recreateAuthAndUi(args, dryRun)
      if (status !== 0) {
        console.error('URL switch failed; restoring the previous app and sign-in configuration.')
        const rollback = recreateAuthAndUi(tailscaleComposeArgs(files, tailscaleEnabled(files), localServices), dryRun)
        if (rollback === 0) disableTailscaleServe(dryRun, created)
        else
          console.error(
            'Restoring the previous configuration also failed. Fix the Docker error and retry the mode switch.'
          )
        return status
      }
    }
    if (!dryRun) saveState(addons, state?.scale ?? null, localServices, getSelectedFormDefIds(state))
    const cleanup = enabled ? 0 : disableTailscaleServe(dryRun)
    console.log(
      files
        ? `Tailscale mode ${enabled ? 'enabled' : 'disabled; app restored to localhost'}. Sign in again at the selected address.`
        : `Tailscale mode ${enabled ? 'selected for the next interactive up' : 'disabled'}.`
    )
    return cleanup
  } catch (error) {
    console.error(error.message)
    disableTailscaleServe(dryRun, created)
    return 1
  }
}

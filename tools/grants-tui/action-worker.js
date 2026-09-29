/* eslint-disable no-console */

// Synchronous command helpers run here so they cannot block the TUI animation.
// Inherited stdout/stderr both point at the run's log, including grandchildren.
import { cmdCheck, cmdDebug, cmdDown, cmdReset, cmdRestart, cmdSnyk, cmdUp } from './commands.js'
import { runApplyFormDefs } from './form-defs.js'
import { cmdJourney } from './journey.js'
import { generateGasOffer } from './gas-offer.js'
import { prepareGasClaim } from './gas-prepare-claim.js'
import { cmdSonar } from './sonar.js'
import { cmdAllTests, cmdTest } from './tests.js'
import { spawnSync } from 'node:child_process'
import { ROOT } from './constants.js'
import { cmdTailscale } from './tailscale.js'
import { createTailscaleShare, revokeAllTailscaleShares, revokeTailscaleShare } from './tailscale-share.js'
import { setupTailscaleSharingPolicy } from './tailscale-policy.js'

function runNpmScript(script, dryRun) {
  console.log(`npm run ${script}`)
  if (dryRun) {
    return 0
  }
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', script], {
    cwd: ROOT,
    stdio: 'inherit'
  })
  if (result.error) {
    console.error(result.error)
  }
  return result.status ?? 1
}

const actions = {
  tailscale: cmdTailscale,
  'tailscale-share:create': async (dryRun) => {
    await createTailscaleShare(dryRun)
    return 0
  },
  'tailscale-share:revoke': revokeTailscaleShare,
  'tailscale-share:revoke-all': revokeAllTailscaleShares,
  'tailscale-policy:setup': setupTailscaleSharingPolicy,
  up: (addons, scale, dryRun, localServices) => cmdUp(addons, scale, dryRun, localServices).status,
  down: cmdDown,
  debug: cmdDebug,
  reset: cmdReset,
  restart: cmdRestart,
  test: cmdTest,
  'all-tests': cmdAllTests,
  lint: (dryRun) => runNpmScript('lint', dryRun),
  format: (dryRun) => runNpmScript('format', dryRun),
  'audit:logs': (dryRun) => runNpmScript('audit:logs', dryRun),
  'audit:queue': (dryRun) => runNpmScript('audit:queue', dryRun),
  'audit:clear': (dryRun) => runNpmScript('audit:clear', dryRun),
  journey: cmdJourney,
  sonar: cmdSonar,
  check: cmdCheck,
  snyk: cmdSnyk,
  'form-defs': runApplyFormDefs,
  'prepare-claim': (application, dryRun) => {
    const result = prepareGasClaim(application, { dryRun })
    if (dryRun) {
      console.log(`Would prepare claim and create PA3 entitlement for ${result.totalHectares}ha`)
    } else {
      console.log(`Claim prepared and PA3 entitlement created: ${result.entitlement.id}`)
    }
    return 0
  },
  'generate-offer': (application, dryRun) => {
    const { event } = generateGasOffer(application, { dryRun })
    if (dryRun) {
      console.log(`Would queue GENERATE_OFFER via ${event.data.currentStatus}`)
    } else {
      console.log(`Offer generation queued (${event.id}); GAS processes it asynchronously`)
    }
    return 0
  }
}

try {
  const [action, args] = JSON.parse(process.argv[2])
  if (!Object.hasOwn(actions, action)) {
    throw new Error(`Unknown action: ${action}`)
  }
  process.exitCode = (await actions[action](...args)) ?? 0
} catch (error) {
  console.error(error)
  process.exitCode = 1
}

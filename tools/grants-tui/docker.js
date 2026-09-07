/* eslint-disable no-console, curly */

import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import { resolve } from 'node:path'

import { ADDONS, BOLD, DIM, GREEN, LOCAL_SERVICES, PURPLE, RED, RESET_COLOR, ROOT } from './constants.js'
import { getSelectedFormDefIds } from './form-defs.js'
import { GAS_DIVIDER } from './gas.js'
import { loadState } from './cli-state.js'
import { registerTempFile } from './temp-files.js'

// ---------------------------------------------------------------------------
// Local image helpers
// ---------------------------------------------------------------------------

/** Returns the set of `<name>:local` image refs that exist in the local Docker daemon */
export function getLocalImages() {
  const result = spawnSync('docker', ['images', '--format', '{{.Repository}}:{{.Tag}}'], { encoding: 'utf8' })
  if (result.status !== 0) return new Set()
  return new Set((result.stdout ?? '').trim().split('\n').filter(Boolean))
}

/**
 * Write a temporary docker-compose override file that replaces the image for
 * each selected service with its `<name>:local` variant.
 * Returns the path to the temp file, or null if nothing to override.
 */
function writeTempOverride(localServiceKeys) {
  if (!localServiceKeys.length) return null
  const hostPlatform = `linux/${os.arch() === 'x64' ? 'amd64' : os.arch()}`
  const services = {}
  for (const key of localServiceKeys) {
    const svc = LOCAL_SERVICES.find((s) => s.key === key)
    if (!svc) continue
    const localImage = svc.key + ':local'
    services[svc.composeService] = { image: localImage, pull_policy: 'never', platform: hostPlatform }
  }
  if (!Object.keys(services).length) return null
  const content =
    'services:\n' +
    Object.entries(services)
      .map(
        ([name, cfg]) =>
          `  ${name}:\n    image: ${cfg.image}\n    pull_policy: ${cfg.pull_policy}\n    platform: ${cfg.platform}`
      )
      .join('\n') +
    '\n'
  const tmpPath = resolve(os.tmpdir(), `grants-ui-cli-local-override-${process.pid}.yml`)
  fs.writeFileSync(tmpPath, content, 'utf8')
  registerTempFile(tmpPath)
  return tmpPath
}

// ---------------------------------------------------------------------------
// Docker compose helpers
// ---------------------------------------------------------------------------

function composeFiles(selectedAddonKeys) {
  const files = ['compose.infra.yml', 'compose.grants-ui.yml']
  const selected = new Set(selectedAddonKeys)
  for (const addon of ADDONS) {
    if (selected.has(addon.key)) files.push(addon.composeFile)
  }
  return files
}

export function composeFileArgs(selectedAddonKeys, localServiceKeys = []) {
  const files = composeFiles(selectedAddonKeys)
  const args = files.flatMap((f) => ['-f', f])
  if (localServiceKeys.length) {
    const tmp = writeTempOverride(localServiceKeys)
    if (tmp) args.push('-f', tmp)
  }
  return args
}

export function runCompose(args, dryRun = false) {
  const fullArgs = ['compose', ...args]
  const displayArgs = fullArgs.map((a) => {
    if (typeof a !== 'string') return a
    if (a.includes('grants-ui-cli-local-override-')) return '<local-override>'
    if (a.includes('grants-ui-cli-debug-override-')) return '<debug-override>'
    return a
  })
  console.log(`\n  ${DIM}▶${RESET_COLOR}  docker ${displayArgs.join(' ')}\n`)
  if (dryRun) return 0
  const result = spawnSync('docker', fullArgs, { cwd: ROOT, stdio: 'inherit', encoding: 'utf8' })
  return result.status ?? 1
}

export function buildStatusLine(runningFiles) {
  if (!runningFiles?.length) {
    return `${DIM}No containers running${RESET_COLOR}`
  }
  const isDebugging = runningFiles.some((f) => f.includes('grants-ui-cli-debug-override-'))
  // The core stack always spans compose.infra + compose.grants-ui (and the legacy
  // single `compose`); collapse them into one "Core" chip so the status line reads
  // "Core" instead of listing each core compose file separately.
  const CORE_BASES = new Set(['compose', 'compose.infra', 'compose.grants-ui'])
  let hasCore = false
  const addonLabels = []
  runningFiles
    .filter((f) => !f.includes('grants-ui-cli-local-override-') && !f.includes('grants-ui-cli-debug-override-'))
    .forEach((f) => {
      const base = f
        .split('/')
        .pop()
        .replace(/\.yml$/, '')
      if (CORE_BASES.has(base)) {
        hasCore = true
        return
      }
      const addon = ADDONS.find((a) => a.composeFile === base + '.yml')
      addonLabels.push(addon ? addon.label : base)
    })
  const labels = hasCore ? ['Core', ...addonLabels] : addonLabels
  if (!labels.length) {
    return `${DIM}No containers running${RESET_COLOR}`
  }
  const state = loadState()
  const localKeys = state?.localServices?.length ? state.localServices : []
  const formDefCount = getSelectedFormDefIds(state).length
  // Local overrides sit behind the same subtle divider used before the GAS badge,
  // read as a plain `Local: …` chip (no parentheses, no `images:` prefix): the
  // overridden image keys and the form-def override count, listed bare.
  const localBits = []
  if (localKeys.length) localBits.push(localKeys.join(', '))
  if (formDefCount) localBits.push(`${formDefCount} form-def overrides`)
  const localSuffix = localBits.length ? `  ${GAS_DIVIDER}  ${PURPLE}Local: ${localBits.join(', ')}${RESET_COLOR}` : ''
  const runningWord = isDebugging ? `${RED}Debugging${RESET_COLOR}` : 'Running'
  const tick = isDebugging ? '🐛' : `${GREEN}✔${RESET_COLOR}`
  return `${tick}  ${runningWord}: ${BOLD}${labels.join(', ')}${RESET_COLOR}${localSuffix}`
}

export function getRunningComposeFiles() {
  const ps = spawnSync(
    'docker',
    ['ps', '--filter', 'label=com.docker.compose.project=grants-ui', '--format', '{{.ID}}'],
    { encoding: 'utf8' }
  )
  const ids = (ps.stdout ?? '').trim().split('\n').filter(Boolean)
  if (!ids.length) return null

  const inspect = spawnSync(
    'docker',
    ['inspect', ids[0], '--format', '{{ index .Config.Labels "com.docker.compose.project.config_files" }}'],
    { encoding: 'utf8' }
  )
  if (inspect.status !== 0 || !inspect.stdout.trim()) return null
  return inspect.stdout
    .trim()
    .split(',')
    .map((f) => f.trim())
}

/**
 * Base URL for the running app: the HA addon fronts it with an HTTPS nginx proxy
 * on 4000, every other stack serves plain HTTP on 3000. Used to default
 * `gt journey`'s target so it works without a manual --base-url.
 * @returns {string}
 */
export function journeyBaseUrl() {
  const runningFiles = getRunningComposeFiles()
  return runningFiles?.some((f) => f.endsWith('compose.ha.yml')) ? 'https://localhost:4000' : 'http://localhost:3000'
}

/**
 * `docker ps [-a]` service-label listing shared by getRunningServices/getAllServices.
 * @param {boolean} all Include stopped containers (`-a`)
 * @returns {string[]}
 */
function dockerPsServiceLabels(all) {
  const args = ['ps']
  if (all) args.push('-a')
  args.push(
    '--filter',
    'label=com.docker.compose.project=grants-ui',
    '--format',
    '{{.Label "com.docker.compose.service"}}'
  )
  const ps = spawnSync('docker', args, { encoding: 'utf8' })
  if (ps.status !== 0) return []
  return (ps.stdout ?? '').trim().split('\n').filter(Boolean)
}

/** Returns the list of running compose service names for the grants-ui project */
export function getRunningServices() {
  return dockerPsServiceLabels(false)
}

/** Returns all compose service names (running or stopped) for the grants-ui project */
export function getAllServices() {
  return [...new Set(dockerPsServiceLabels(true))]
}

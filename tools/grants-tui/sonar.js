/* eslint-disable no-console, curly, promise/param-names */

import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import { resolve } from 'node:path'

import { DIM, GREEN, RED, RESET_COLOR, ROOT, SONAR, SONAR_EXIT, YELLOW } from './constants.js'
import { cmdTest } from './tests.js'

// ---------------------------------------------------------------------------
// Local SonarQube helpers (see SONAR const above)
// ---------------------------------------------------------------------------

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Read the cached Sonar credentials, or an empty object if none/unreadable.
 * @returns {SonarState}
 */
export function readSonarState() {
  try {
    return JSON.parse(fs.readFileSync(SONAR.stateFile, 'utf8'))
  } catch {
    return {}
  }
}

/**
 * Persist the Sonar credentials (chmod 600 where supported).
 * @param {SonarState} state
 * @returns {void}
 */
export function writeSonarState(state) {
  fs.writeFileSync(SONAR.stateFile, JSON.stringify(state, null, 2))
  try {
    fs.chmodSync(SONAR.stateFile, 0o600)
  } catch {
    /* best-effort on platforms without POSIX perms */
  }
}

/**
 * Call the SonarQube web API. `auth` is a raw `user:pass` (or `token:`) string.
 * @param {string} path  API path beginning with `/`
 * @param {SonarApiOptions} [opts]
 * @returns {Promise<Response>}
 */
export function sonarApi(path, { method = 'GET', auth, body } = {}) {
  // `Connection: close` forces a fresh socket per call. Otherwise undici pools
  // keep-alive sockets, and the long (~70s) scanner gap lets SonarQube close a
  // pooled socket — the next poll would reuse the dead one (UND_ERR_SOCKET).
  /** @type {Record<string, string>} */
  const headers = { Connection: 'close' }
  if (auth) headers.Authorization = `Basic ${Buffer.from(auth).toString('base64')}`
  if (body) headers['Content-Type'] = 'application/x-www-form-urlencoded'
  return fetch(`${SONAR.hostUrl}${path}`, { method, headers, body })
}

/** Poll GET /api/system/status until the server reports UP or we time out. */
export async function waitForSonarUp() {
  const deadline = Date.now() + SONAR.readyTimeoutMs
  process.stdout.write(`  ${DIM}Waiting for SonarQube to come up (first boot ~60-90s)…${RESET_COLOR}`)
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${SONAR.hostUrl}/api/system/status`)
      if (res.ok) {
        const { status } = await res.json()
        if (status === 'UP') {
          process.stdout.write(` ${GREEN}up${RESET_COLOR}\n`)
          return true
        }
      }
    } catch {
      /* server not listening yet */
    }
    process.stdout.write('.')
    await sleep(3000)
  }
  process.stdout.write('\n')
  return false
}

/**
 * Return a scanner token for the local server, bootstrapping a fresh container
 * on first run (change the forced admin/admin password, then mint a token) and
 * caching the credentials in SONAR.stateFile so later runs reuse them.
 * @returns {Promise<string>}
 */
export async function ensureSonarToken() {
  const state = readSonarState()

  // Reuse a still-valid cached token.
  if (state.token) {
    const res = await sonarApi('/api/authentication/validate', { auth: `${state.token}:` })
    if (res.ok && (await res.json()).valid) return state.token
  }

  // Establish the admin password. A fresh container still has admin/admin and
  // forces a change on first use; a bootstrapped one needs the cached password.
  let adminPassword = state.adminPassword
  if (!adminPassword) {
    const newPassword = `Gu-${randomUUID()}`
    const res = await sonarApi('/api/users/change_password', {
      method: 'POST',
      auth: 'admin:admin',
      body: new URLSearchParams({ login: 'admin', previousPassword: 'admin', password: newPassword })
    })
    if (res.ok) {
      adminPassword = newPassword
      // Persist the rotated password now — the server has already accepted it,
      // so if the token mint below fails we can still authenticate on the next
      // run instead of dead-ending on admin/admin (401 → forced volume reset).
      writeSonarState({ ...state, adminPassword })
    } else if (res.status === 401) {
      throw new Error(
        "SonarQube is already bootstrapped but its saved credentials are gone. Reset it with 'gt sonar --down' + remove the sonarqube volume, or 'gt reset'."
      )
    } else {
      throw new Error(`Could not set the SonarQube admin password (HTTP ${res.status}).`)
    }
  }

  // Mint a uniquely-named token (Sonar rejects duplicate names).
  const tokenSeq = (state.tokenSeq ?? 0) + 1
  const res = await sonarApi('/api/user_tokens/generate', {
    method: 'POST',
    auth: `admin:${adminPassword}`,
    body: new URLSearchParams({ name: `${SONAR.projectKey}-${tokenSeq}` })
  })
  if (!res.ok) throw new Error(`Could not mint a SonarQube token (HTTP ${res.status}).`)
  const { token } = await res.json()
  writeSonarState({ adminPassword, token, tokenSeq })
  return token
}

/**
 * Delete the local project so each scan starts from a clean slate — otherwise the
 * project accumulates prior analyses and "new code" keeps flagging untested files
 * from earlier runs.
 * @param {string} token  scanner/admin token for Basic auth
 * @returns {Promise<void>}
 */
export async function resetSonarProject(token) {
  const res = await sonarApi('/api/projects/delete', {
    method: 'POST',
    auth: `${token}:`,
    body: new URLSearchParams({ project: SONAR.projectKey })
  })
  if (!res.ok && res.status !== 404) {
    console.log(`  ${YELLOW}⚠${RESET_COLOR}  Could not reset the local project (HTTP ${res.status}) — continuing.`)
  }
}

/**
 * Create the local project if it doesn't already exist (HTTP 400 = exists).
 * @param {string} token  scanner/admin token for Basic auth
 * @returns {Promise<void>}
 */
export async function ensureSonarProject(token) {
  const res = await sonarApi('/api/projects/create', {
    method: 'POST',
    auth: `${token}:`,
    body: new URLSearchParams({ project: SONAR.projectKey, name: 'grants-ui (local)' })
  })
  if (!res.ok && res.status !== 400) {
    throw new Error(`Could not create the SonarQube project (HTTP ${res.status}).`)
  }
}

/**
 * Turn off forced authentication so the dashboard link opens the real project
 * anonymously — otherwise it redirects to a login the user has no password for
 * (admin's password is a random UUID in the state file). Best-effort; non-fatal.
 * @param {string} token  scanner/admin token for Basic auth
 * @returns {Promise<void>}
 */
export async function disableForcedAuth(token) {
  try {
    await sonarApi('/api/settings/set', {
      method: 'POST',
      auth: `${token}:`,
      body: new URLSearchParams({ key: 'sonar.forceAuthentication', value: 'false' })
    })
  } catch {
    /* leave auth as-is; the run still works, the link just needs a login */
  }
}

/**
 * Find the Compute Engine task id the scanner just queued. The scanner writes
 * `.scannerwork/report-task.txt`, but that doesn't reliably surface on the bind
 * mount, so we primarily scrape the id from the tee'd scanner output (which
 * always logs `…/api/ce/task?id=<id>`), falling back to the file when present.
 * @returns {string | null}  the compute-engine task id, or null if not found
 */
export function readCeTaskId() {
  try {
    const m = fs.readFileSync(SONAR.logFile, 'utf8').match(/\/api\/ce\/task\?id=([0-9a-f-]+)/)
    if (m) return m[1]
  } catch {
    /* no tee log (e.g. win32) — try the report file */
  }
  try {
    const m = fs.readFileSync(resolve(ROOT, '.scannerwork', 'report-task.txt'), 'utf8').match(/ceTaskId=(.+)/)
    if (m) return m[1].trim()
  } catch {
    /* nothing to parse */
  }
  return null
}

/**
 * Poll the Compute Engine task the scanner queued until the server finishes
 * processing the report. Returns the analysisId on SUCCESS, or null otherwise.
 * @param {string} taskId  compute-engine task id from readCeTaskId
 * @param {string} token  scanner/admin token for Basic auth
 * @returns {Promise<string | null>}  analysisId on success, else null
 */
export async function waitForCeTask(taskId, token) {
  const deadline = Date.now() + 90000
  while (Date.now() < deadline) {
    try {
      const res = await sonarApi(`/api/ce/task?id=${encodeURIComponent(taskId)}`, { auth: `${token}:` })
      if (res.ok) {
        const { task } = await res.json()
        if (task.status === 'SUCCESS') return task.analysisId
        if (task.status === 'FAILED' || task.status === 'CANCELED') return null
      }
    } catch {
      // Transient socket drop while the server is busy processing the report
      // (e.g. UND_ERR_SOCKET) — show progress and keep polling until the deadline.
      process.stdout.write('.')
    }
    await sleep(2000)
  }
  return null
}

/**
 * Fetch the quality-gate outcome for a completed analysis.
 * @param {string} analysisId  analysisId from waitForCeTask
 * @param {string} token  scanner/admin token for Basic auth
 * @returns {Promise<QualityGate | null>}  the gate status, or null on error
 */
export async function fetchQualityGate(analysisId, token) {
  try {
    const res = await sonarApi(`/api/qualitygates/project_status?analysisId=${encodeURIComponent(analysisId)}`, {
      auth: `${token}:`
    })
    return res.ok ? (await res.json()).projectStatus : null
  } catch (err) {
    console.log(`\n  ${YELLOW}⚠${RESET_COLOR}  Could not read the quality gate: ${/** @type {Error} */ (err).message}`)
    return null
  }
}

/**
 * Files changed on this branch vs main (committed + working tree), src/ only.
 * Used by `gt sonar --changed` to approximate CI's PR-scoped analysis, since the
 * local Community Edition server has no branch/PR analysis. Returns null when git
 * is unavailable or this isn't a repo (caller falls back to a full scan).
 * @returns {string[] | null}
 */
export function changedSrcFiles() {
  const run = (/** @type {string[]} */ args) => {
    const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' })
    return r.status === 0
      ? r.stdout
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean)
      : null
  }
  const committed = run(['diff', '--name-only', 'main...HEAD']) // merge-base = PR commits
  const working = run(['diff', '--name-only', 'HEAD']) // staged + unstaged WIP
  if (committed === null || working === null) return null
  const set = new Set([...committed, ...working])
  return [...set].filter((f) => f.startsWith('src/') && fs.existsSync(resolve(ROOT, f)))
}

/**
 * Print the quality gate result; returns true when it passed.
 * @param {QualityGate} qg
 * @returns {boolean}  true when the gate status is OK
 */
export function printQualityGate(qg) {
  if (qg.status === 'OK') {
    console.log(`\n  ${GREEN}✔  Quality Gate: PASSED${RESET_COLOR}`)
    return true
  }
  console.log(`\n  ${RED}✖  Quality Gate: FAILED${RESET_COLOR}`)
  for (const c of (qg.conditions ?? []).filter((x) => x.status === 'ERROR')) {
    console.log(
      `    ${RED}•${RESET_COLOR} ${c.metricKey}: ${c.actualValue} (fails ${c.comparator} ${c.errorThreshold})`
    )
  }
  return false
}

/**
 * Run a SonarQube analysis against the local server. Boots the container,
 * bootstraps a token, ensures coverage exists, then runs the scanner with -D
 * flags that retarget the CI `sonar-project.properties` at the local instance.
 * @param {{dryRun?:boolean, down?:boolean, skipTests?:boolean, changed?:boolean}} [opts]
 * @returns {Promise<number>} child exit code (0 = pass)
 */
export async function cmdSonar({ dryRun = false, down = false, skipTests = false, changed = false } = {}) {
  const composeArgs = ['compose', '-f', SONAR.composeFile]

  if (down) {
    console.log(`\n  ${DIM}▶${RESET_COLOR}  docker ${composeArgs.join(' ')} down\n`)
    if (dryRun) return 0
    const r = spawnSync('docker', [...composeArgs, 'down'], { cwd: ROOT, stdio: 'inherit', encoding: 'utf8' })
    return r.status ?? 1
  }

  // --changed: scope the scan to src files this branch changed vs main (approximates
  // CI's PR view). No changed src files → nothing to check, so skip before booting the
  // server rather than full-scanning, which would re-flag untested code already on main.
  let inclusions = null
  if (changed) {
    const files = changedSrcFiles()
    if (files === null) {
      console.log(
        `\n  ${YELLOW}⚠${RESET_COLOR}  --changed: couldn't diff vs main (git error or no local 'main' ref) —` +
          ` ${DIM}running a full scan instead.${RESET_COLOR}\n`
      )
    } else if (files.length === 0) {
      console.log(
        `\n  ${YELLOW}⚠${RESET_COLOR}  --changed: no src files changed vs main — nothing to scan.` +
          ` ${DIM}(Use plain 'gt sonar' for a full scan.)${RESET_COLOR}\n`
      )
      return SONAR_EXIT.OK
    } else {
      inclusions = files
      console.log(`\n  ${DIM}Scoping to ${files.length} changed src file(s) vs main:${RESET_COLOR}`)
      for (const f of files) console.log(`    ${DIM}• ${f}${RESET_COLOR}`)
    }
  }

  // 1. Start the server and wait for readiness.
  console.log(`\n  ${DIM}▶${RESET_COLOR}  docker ${composeArgs.join(' ')} up -d ${SONAR.serverService}\n`)
  if (!dryRun) {
    const up = spawnSync('docker', [...composeArgs, 'up', '-d', SONAR.serverService], {
      cwd: ROOT,
      stdio: 'inherit',
      encoding: 'utf8'
    })
    if ((up.status ?? 1) !== 0) return SONAR_EXIT.ERROR
    if (!(await waitForSonarUp())) {
      console.error(`\n  ${RED}✖${RESET_COLOR}  SonarQube did not come up within ${SONAR.readyTimeoutMs / 1000}s.\n`)
      return SONAR_EXIT.ERROR
    }
  }

  // 2. Bootstrap credentials + project.
  let token = '<token>'
  if (!dryRun) {
    try {
      token = await ensureSonarToken()
      await resetSonarProject(token) // clean slate each run — no stale "new code"
      await ensureSonarProject(token)
      await disableForcedAuth(token)
    } catch (err) {
      console.error(`\n  ${RED}✖${RESET_COLOR}  ${/** @type {Error} */ (err).message}\n`)
      return SONAR_EXIT.ERROR
    }
  }

  // 3. Ensure coverage/lcov.info exists (the scanner reads it for coverage).
  const haveCoverage = fs.existsSync(resolve(ROOT, 'coverage', 'lcov.info'))
  if (!haveCoverage && !skipTests) {
    console.log(`\n  ${DIM}coverage/lcov.info not found — running unit tests first${RESET_COLOR}`)
    const code = cmdTest('unit', dryRun)
    if (code !== 0) return SONAR_EXIT.ERROR
  } else if (!haveCoverage) {
    console.log(
      `\n  ${YELLOW}⚠${RESET_COLOR}  coverage/lcov.info missing (--skip-tests) — scan will show no coverage.\n`
    )
  }

  // 4. Run the scanner. Flags after the service name override the image
  // entrypoint's args, retargeting sonar-project.properties at the local server.
  const flags = [
    `-Dsonar.host.url=${SONAR.internalUrl}`,
    `-Dsonar.token=${token}`,
    `-Dsonar.projectKey=${SONAR.projectKey}`
  ]
  if (inclusions) flags.push(`-Dsonar.inclusions=${inclusions.join(',')}`)
  const runCmd = `docker ${composeArgs.join(' ')} run --rm ${SONAR.scannerService} ${flags.join(' ')}`
  console.log(`\n  ${DIM}▶${RESET_COLOR}  ${runCmd.replace(token, '***')}\n`)
  if (dryRun) return 0

  let status
  if (process.platform === 'win32') {
    const r = spawnSync('docker', [...composeArgs, 'run', '--rm', SONAR.scannerService, ...flags], {
      cwd: ROOT,
      stdio: 'inherit',
      encoding: 'utf8'
    })
    status = r.status ?? 1
  } else {
    const r = spawnSync('bash', ['-c', `set -o pipefail; ${runCmd} 2>&1 | tee "${SONAR.logFile}"`], {
      cwd: ROOT,
      stdio: 'inherit',
      encoding: 'utf8'
    })
    status = r.status ?? 1
    console.log(`\n  ${DIM}output: ${SONAR.logFile}${RESET_COLOR}`)
  }

  // A non-zero scanner exit means the upload itself failed — infra error.
  // Leave the server up so the failure can be inspected.
  if (status !== 0) return SONAR_EXIT.ERROR

  // The scanner exits 0 once the report is uploaded; the server then processes
  // it asynchronously. Poll that task, then report the actual quality gate.
  const ceTaskId = readCeTaskId()
  /** @type {boolean | null} */
  let gatePassed = null
  if (ceTaskId) {
    process.stdout.write(`\n  ${DIM}Processing analysis on the server…${RESET_COLOR}`)
    const analysisId = await waitForCeTask(ceTaskId, token)
    process.stdout.write('\n')
    if (analysisId) {
      const qg = await fetchQualityGate(analysisId, token)
      if (qg) gatePassed = printQualityGate(qg)
    } else {
      console.log(`  ${YELLOW}⚠${RESET_COLOR}  Server didn't finish processing in time.`)
    }
  }

  // Leave the server running so the results dashboard stays browsable. Stop it
  // with `gt sonar --down` (keeps volumes → next run skips bootstrap) or `gt reset`.
  console.log(
    `\n  ${DIM}SonarQube left running — results at ${SONAR.hostUrl}  (stop with 'gt sonar --down')${RESET_COLOR}`
  )

  return gatePassed === false ? SONAR_EXIT.GATE_FAILED : SONAR_EXIT.OK
}

/**
 * @typedef {object} SonarApiOptions
 * @property {string} [method]  HTTP method (defaults to GET)
 * @property {string} [auth]  raw `user:pass` (or `token:`) string for Basic auth
 * @property {URLSearchParams} [body]  form-encoded request body
 */

/**
 * Cached local-server credentials persisted in SONAR.stateFile.
 * @typedef {object} SonarState
 * @property {string} [token]  the current scanner token
 * @property {string} [adminPassword]  rotated admin password (random UUID)
 * @property {number} [tokenSeq]  monotonic counter making minted token names unique
 */

/**
 * A single failing quality-gate condition.
 * @typedef {object} QualityGateCondition
 * @property {string} status  e.g. 'OK' | 'ERROR'
 * @property {string} metricKey  the metric that was evaluated
 * @property {string} actualValue  the measured value
 * @property {string} comparator  comparison operator (GT/LT/…)
 * @property {string} errorThreshold  the failing threshold
 */

/**
 * Quality-gate outcome from /api/qualitygates/project_status.
 * @typedef {object} QualityGate
 * @property {string} status  'OK' when the gate passed
 * @property {QualityGateCondition[]} [conditions]  per-metric results
 */

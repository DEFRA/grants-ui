#!/usr/bin/env node
/* eslint-disable no-console */
/*
  Post-hook checker for `npm run docker:landgrants:up` (and HA variant).

  Behaviour:
  - Skips entirely when LANDGRANTS_CHANGELOG_CHECK=false.
  - Detects whether the DB has been seeded by checking for table `public.actions`
    inside the `land_grants_api` database (via a simple psql call).
  - Computes a baseline time from either:
      * the mtime of `/var/lib/postgresql/data/global` inside the
        `land-grants-backend-postgres` container, or
      * the Docker volume `grants-ui_postgres_data` CreatedAt time.
  - If the DB has never been seeded, always prints a boxed notice telling the
    developer to run the migration/seed scripts.
  - If the DB has been seeded, compares DEFRA/land-grants-api `changelog/`
    commits against the baseline and prints a boxed notice if newer changes
    exist.
  - Never fails the Docker command; this script only logs guidance.
*/

import { execSync } from 'node:child_process'

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
}

async function main() {
  try {
    if (process.env.LANDGRANTS_CHANGELOG_CHECK === 'false') {
      logDim('Skipping Land Grants changelog check (LANDGRANTS_CHANGELOG_CHECK=false)')
      return
    }

    const volumeName = 'grants-ui_postgres_data'
    const seeded = hasBeenSeeded()

    const dbBaseline = getGlobalMtimeFromContainer()
    const volumeBaseline = getDockerVolumeInfo(volumeName)

    if (!dbBaseline && !volumeBaseline) {
      logDim(`No baseline time for ${volumeName}; remember to seed the database before use.`)
      return
    }

    const baseline = dbBaseline || volumeBaseline

    // If DB has never been seeded, always prompt to seed at least once
    if (!seeded) {
      showBoxedNotice({
        volumeName,
        baseline,
        latestMsg: 'Initial setup',
        latestDate: 'unknown date',
        count: 0,
        message:
          'Land grants Postgres database has not been seeded yet - you should run the migration/seed scripts before continuing.'
      })
      return
    }

    const commits = await fetchCommitsSince('DEFRA', 'land-grants-api', 'changelog', baseline?.toISOString())
    if (!Array.isArray(commits) || commits.length === 0) {
      logDim('Land Grants changelog has no changes since your local Postgres data baseline.')
      return
    }

    const latest = commits[0]
    const count = commits.length
    const latestMsg = latest.commit?.message?.split('\n')[0] || 'Update'
    const latestDate = latest.commit?.committer?.date || latest.commit?.author?.date || 'unknown date'

    showBoxedNotice({
      volumeName,
      baseline,
      latestMsg,
      latestDate,
      count,
      message: 'Land grants Postgres changelog has updates - you should re-seed the database before continuing.'
    })
  } catch (err) {
    logDim(`Changelog check skipped (${err?.message || err}).`)
  }
}

// Returns Date or null (volume CreatedAt)
function getDockerVolumeInfo(volumeName) {
  try {
    const out = execSync(`docker volume inspect ${volumeName} --format '{{.CreatedAt}}|{{.Mountpoint}}'`, {
      stdio: ['ignore', 'pipe', 'ignore']
    })
    const s = String(out).trim()
    if (!s) {
      return null
    }
    const [createdAtStr] = s.split('|')
    const d = createdAtStr ? new Date(createdAtStr) : null
    // @ts-ignore
    return d && !isNaN(d) ? d : null
  } catch {
    return null
  }
}

// Returns true if the DB appears to have been seeded at least once
function hasBeenSeeded() {
  try {
    const composeFiles = ['-f compose.yml', '-f compose.land-grants.yml'].join(' ')
    const service = 'land-grants-backend-postgres'
    // Use a simple psql call inside the container with hard-coded local
    // defaults (land_grants_api) to detect the presence of the `actions` table.
    // Dollar-quoting ($$public.actions$$) avoids fragile single-quote escaping.
    const cmd =
      `docker compose ${composeFiles} exec -T ${service} ` +
      `psql -U land_grants_api -d land_grants_api -tAc "SELECT to_regclass('public.actions') IS NOT NULL;"`

    const out = execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] })
    const s = String(out).trim()
    return s === 't' || s === 'true'
  } catch {
    // On any failure, treat as unseeded so the dev gets prompted to seed
    return false
  }
}

// Returns Date or null by exec'ing into the running postgres container and reading mtime of the `global` dir
function getGlobalMtimeFromContainer() {
  try {
    const composeFiles = ['-f compose.yml', '-f compose.land-grants.yml'].join(' ')
    const service = 'land-grants-backend-postgres'
    const cmd =
      `docker compose ${composeFiles} exec -T ${service} sh -lc '` +
      `stat -c %Y /var/lib/postgresql/data/global 2>/dev/null'`

    const out = execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] })
    const s = String(out).trim()

    if (!s) {
      return null
    }
    const epoch = Number(s)
    if (!Number.isFinite(epoch) || epoch <= 0) {
      return null
    }
    return new Date(epoch * 1000)
  } catch (err) {
    logWarn(err)
    return null
  }
}

function showBoxedNotice({ volumeName, baseline, latestMsg, latestDate, count, message }) {
  const basisLabel = `baseline: ${ANSI.cyan}${baseline.toISOString()}${ANSI.reset}`

  const headerBase = latestMsg
    ? `Land Grants changelog has ${count} change${count > 1 ? 's' : ''} since your local Postgres data baseline.`
    : 'Land Grants Postgres database requires seeding.'

  const header = `${ANSI.bold}${ANSI.yellow}Note:${ANSI.reset} ${headerBase}`
  const details = `Volume: ${ANSI.cyan}${volumeName}${ANSI.reset}  ${basisLabel}`
  const latestLine = latestMsg ? `Latest: ${latestMsg} (${latestDate})` : null

  const lines = [header, details, latestLine].filter(Boolean)
  const maxLen = Math.max(...lines.map((l) => stripAnsi(l).length))
  const top = '┌' + '─'.repeat(maxLen + 2) + '┐'
  const bottom = '└' + '─'.repeat(maxLen + 2) + '┘'
  console.log('\n' + top)
  lines.forEach((l) => console.log('│ ' + l + ' '.repeat(maxLen - stripAnsi(l).length) + ' │'))
  console.log(bottom + '\n')

  logWarn(message)
}

async function fetchCommitsSince(owner, repo, pathParam, sinceIso) {
  const u = new URL(`https://api.github.com/repos/${owner}/${repo}/commits`)
  u.searchParams.set('path', pathParam)
  u.searchParams.set('since', sinceIso)

  const headers = {
    'User-Agent': 'grants-ui/check-landgrants-changelog',
    Accept: 'application/vnd.github+json'
  }

  const res = await fetch(u, { headers })
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}`)
  }
  return res.json()
}

function stripAnsi(s) {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '')
}
function logDim(msg) {
  console.log(`${ANSI.gray}${msg}${ANSI.reset}`)
}
function logWarn(msg) {
  console.log(`${ANSI.yellow}${ANSI.bold}${msg}${ANSI.reset}`)
}

await main()

/* eslint-disable curly */

import { open } from 'node:fs/promises'
import { StringDecoder } from 'node:string_decoder'
import { stripVTControlCharacters } from 'node:util'

const ACCEPTANCE_PHASES = [
  ['Fetching ', 'Acceptance: fetching test configuration'],
  ['Running pre-emptive volume cleanse...', 'Acceptance: preparing Docker volumes'],
  ['Building docker compose containers...', 'Acceptance: building containers'],
  ['Starting services with docker compose...', 'Acceptance: starting services'],
  ['Waiting for services to be healthy...', 'Acceptance: waiting for healthy services'],
  ['Service started, now waiting for health check to pass...', 'Acceptance: waiting for health checks'],
  ['Waiting for example-grant-with-auth backend definition', 'Acceptance: waiting for form definitions'],
  ['Applying local form-definition overrides...', 'Acceptance: applying form-def overrides'],
  ['Running Acceptance Tests...', 'Acceptance: running browser tests'],
  ['Failure detected; dumping docker compose diagnostics', 'Acceptance: collecting failure diagnostics'],
  ['Cleaning up docker compose stacks...', 'Acceptance: cleaning up containers']
]

/** Recognise milestones only; arbitrary log content never becomes status text. */
export function createProgressTracker(action, args = []) {
  let suite = action === 'test' ? args[0] : null
  const completedFiles = new Set()
  const healthyServices = new Set()
  return (rawLine) => {
    const line = stripVTControlCharacters(rawLine).trim()
    const testCommand = line.match(/▶\s+npm run (test(?::contracts|:acceptance)?)(?:\s|$)/)
    if (testCommand) {
      suite = testCommand[1] === 'test' ? 'unit' : testCommand[1].slice(5)
      completedFiles.clear()
      return suite === 'acceptance' ? 'Acceptance: preparing test stack' : `${suite}: starting tests`
    }
    if (/▶\s+snyk test\b/.test(line)) {
      suite = null
      return 'Snyk: scanning dependencies'
    }
    if (/▶\s+docker compose .*sonarqube/.test(line)) {
      suite = null
      return 'Sonar: starting analysis server'
    }
    if (/▶\s+docker compose .*sonar-scanner/.test(line)) return 'Sonar: analysing code'
    if (line.includes('pre-pr check summary')) return 'Pre-PR check: preparing results'
    if (line === 'All tests summary:') return 'All tests: preparing results'

    if (suite === 'unit' || suite === 'contracts') {
      if (/^RUN\s+v\d/.test(line)) return `${suite}: collecting tests`
      const file = line.match(/^[✓✔❯×]\s+(.+\.(?:test|spec)\.[cm]?[jt]sx?)\s/)
      if (file) {
        completedFiles.add(file[1])
        return `${suite}: ${completedFiles.size} test file${completedFiles.size === 1 ? '' : 's'} completed`
      }
      if (line.includes('Coverage report from')) return `${suite}: coverage report ready`
    }
    if (suite === 'acceptance') {
      // Readiness scripts print dots/letters without newlines before some milestones.
      const phase = ACCEPTANCE_PHASES.find(([marker]) => line.includes(marker))
      if (phase) return phase[1]
    }
    if (action === 'up') {
      if (line.includes('Running pre-up script:')) return 'Docker: preparing local configuration'
      if (line.startsWith('Resolving latest tag')) return 'Docker: resolving configuration versions'
      if (line.startsWith('Fetching configuration file list')) return 'Docker: downloading configuration'
      if (/▶\s+docker compose .* up\b/.test(line)) return 'Docker: starting containers and checking health'
      if (/\b(Pulling|Downloading|Extracting)\b/.test(line)) return 'Docker: pulling images'
      if (/\bContainer\s+\S+\s+(Creating|Starting|Recreate)\b/.test(line)) return 'Docker: starting containers'
      if (/\bContainer\s+\S+\s+Waiting\b/.test(line)) return 'Docker: waiting for healthy services'
      const healthy = line.match(/\bContainer\s+(\S+)\s+Healthy\b/)
      if (healthy) {
        healthyServices.add(healthy[1])
        return `Docker: ${healthyServices.size} service${healthyServices.size === 1 ? '' : 's'} healthy`
      }
      if (/▶\s+(Applying|Removing) local form-definition overrides/.test(line)) {
        return 'Docker: reconciling form-def overrides'
      }
    }
    return null
  }
}

/**
 * Follow the existing log without redirecting stdout or blocking the command.
 * Only new bytes are read; partial UTF-8 and lines survive across polls.
 * @param {string} logPath
 * @param {(line: string) => void} onLine
 * @returns {() => Promise<void>}
 */
export function followProgress(logPath, onLine) {
  const decoder = new StringDecoder('utf8')
  let offset = 0
  let remainder = ''
  let stopped = false
  const handle = open(logPath, 'r')
  let pending = Promise.resolve()

  function report(line) {
    try {
      onLine(line)
    } catch {
      // A progress-rendering failure must not affect output capture or exit codes.
    }
  }
  function consume(text) {
    const lines = (remainder + text).split(/[\r\n]/)
    remainder = lines.pop() ?? ''
    // Keep memory bounded even if a tool writes a huge line without line breaks.
    if (remainder.length > 8192) remainder = remainder.slice(-8192)
    for (const line of lines) report(line)
  }
  async function readAvailable() {
    try {
      const file = await handle
      const end = (await file.stat()).size
      const buffer = Buffer.alloc(64 * 1024)
      while (offset < end) {
        const { bytesRead } = await file.read(buffer, 0, Math.min(buffer.length, end - offset), offset)
        if (!bytesRead) break
        offset += bytesRead
        consume(decoder.write(buffer.subarray(0, bytesRead)))
      }
    } catch {
      // Progress is optional; an unreadable log must not change the action result.
    }
  }
  function poll() {
    pending = readAvailable().finally(() => {
      if (!stopped) timer = setTimeout(poll, 150)
    })
  }
  let timer = setTimeout(poll, 0)
  // Handle an open failure immediately, even if the first poll has not run yet.
  handle.catch(() => {})
  return async () => {
    stopped = true
    clearTimeout(timer)
    await pending
    await readAvailable()
    consume(decoder.end())
    if (remainder) report(remainder)
    await handle.then((file) => file.close()).catch(() => {})
  }
}

/* eslint-disable no-console */

import { execFile, spawnSync } from 'node:child_process'
import { inspect } from 'node:util'

import { BOLD, CYAN, DIM, RED, RESET_COLOR, ROOT } from './constants.js'
import { markedResult, mongoExecArgs } from './mongo.js'

const MONGO_DB = process.env.GRANTS_UI_BACKEND_DB || 'grants-ui-backend'
const STATE_COLLECTION = 'state__grant_application_state'
const RESULT_MARKER = 'GT_STATE_RESULT:'

/**
 * Build the exact application-state filter. SBI values are persisted as strings.
 *
 * @param {{ grantCode: string, sbi: string|number, grantVersion?: string }} options
 */
export function buildStateQuery({ grantCode, sbi, grantVersion }) {
  return {
    grantCode,
    sbi: String(sbi),
    ...(grantVersion ? { grantVersion } : {})
  }
}

/**
 * Build a read-only mongosh script. JSON.stringify safely quotes user-provided
 * filter values before they are embedded in JavaScript.
 *
 * @param {Record<string, string>} query
 */
export function buildStateScript(query) {
  return (
    `const documents = db.getCollection(${JSON.stringify(STATE_COLLECTION)})\n` +
    `.find(${JSON.stringify(query)})\n` +
    `.sort({ major: -1, minor: -1, patch: -1, updatedAt: -1 })\n` +
    `.toArray();\n` +
    `print(${JSON.stringify(RESULT_MARKER)} + EJSON.stringify(documents));\n`
  )
}

/** Only load selection metadata, never other businesses' application answers. */
export function buildStateCatalogScript() {
  return (
    `const documents = db.getCollection(${JSON.stringify(STATE_COLLECTION)})\n` +
    '.find({}, { _id: 0, grantCode: 1, sbi: 1, grantVersion: 1 }).toArray();\n' +
    `print(${JSON.stringify(RESULT_MARKER)} + EJSON.stringify(documents));\n`
  )
}

/**
 * Extract the marked EJSON-compatible JSON emitted by mongosh.
 *
 * @param {string} output
 */
export function parseStateResult(output) {
  const documents = markedResult(RESULT_MARKER, output, 'MongoDB returned no application-state result')
  if (!Array.isArray(documents) || documents.some((doc) => !doc || typeof doc !== 'object' || Array.isArray(doc))) {
    throw new Error('MongoDB returned an invalid application-state result')
  }
  return documents
}

function stateCommand(input) {
  return { args: mongoExecArgs(MONGO_DB), input }
}

/**
 * @typedef {(command: string, args: string[], options: import('node:child_process').ExecFileOptionsWithStringEncoding,
 * callback: (error: Error | null, stdout: string, stderr: string) => void) =>
 * { stdin?: Pick<import('node:stream').Writable, 'on' | 'end'> | null }} StateExecutor
 */

/**
 * @param {{ grantCode: string, sbi: string, grantVersion?: string }} options
 * @param {AbortSignal | undefined} signal
 * @param {StateExecutor} [execute]
 */
export function fetchState(options, signal, execute = execFile) {
  return fetchStateScript(buildStateScript(buildStateQuery(options)), signal, execute)
}

/** @param {AbortSignal} signal @param {StateExecutor} [execute] */
export function fetchStateCatalog(signal, execute = execFile) {
  return fetchStateScript(buildStateCatalogScript(), signal, execute)
}

/**
 * Read asynchronously so menus remain responsive while MongoDB is unavailable.
 * @param {string} input
 * @param {AbortSignal | undefined} signal
 * @param {StateExecutor} execute
 * @returns {Promise<Record<string, any>[]>}
 */
function fetchStateScript(input, signal, execute) {
  const { args } = stateCommand(input)
  return new Promise((resolve, reject) => {
    const child = execute(
      'docker',
      args,
      {
        cwd: ROOT,
        encoding: 'utf8',
        timeout: 30000,
        maxBuffer: 16 * 1024 * 1024,
        signal
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new Error(
              `Could not inspect application state. Check Docker and the MongoDB service. ${stderr?.trim() || error.message}`,
              { cause: error }
            )
          )
          return
        }
        try {
          resolve(parseStateResult(stdout))
        } catch (error) {
          reject(error)
        }
      }
    )
    // Early process exit is reported by the callback; do not leak an EPIPE event.
    child.stdin?.on('error', () => {})
    child.stdin?.end(input)
  })
}

/**
 * Inspect persisted application state through the local MongoDB container.
 *
 * @param {{ grantCode: string, sbi: string, grantVersion?: string, json?: boolean }} options
 * @param {typeof spawnSync} [spawn]
 * @returns {number} process exit code
 */
export function cmdState({ grantCode, sbi, grantVersion, json = false }, spawn = spawnSync) {
  if (!grantCode || !sbi) {
    console.error(
      `\n  ${RED}✖${RESET_COLOR}  Usage: gt state <grant-code> --sbi <sbi> [--grant-version <version>] [--json]\n`
    )
    return 2
  }

  const { args, input } = stateCommand(buildStateScript(buildStateQuery({ grantCode, sbi, grantVersion })))
  const result = spawn('docker', args, {
    input,
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe']
  })

  if (result.status !== 0 || result.error) {
    const detail = result.error?.message || result.stderr?.trim() || 'MongoDB is unavailable'
    console.error(`\n  ${RED}✖${RESET_COLOR}  Could not inspect application state. Is the stack running?`)
    console.error(`  ${DIM}${detail}${RESET_COLOR}\n`)
    return 1
  }

  let documents
  try {
    documents = parseStateResult(result.stdout ?? '')
  } catch (error) {
    console.error(`\n  ${RED}✖${RESET_COLOR}  ${/** @type {Error} */ (error).message}.\n`)
    return 1
  }

  if (!documents.length) {
    console.error(
      `\n  ${RED}✖${RESET_COLOR}  No application state found for grant ${CYAN}${grantCode}${RESET_COLOR}, SBI ${CYAN}${sbi}${RESET_COLOR}` +
        `${grantVersion ? `, version ${CYAN}${grantVersion}${RESET_COLOR}` : ''}.\n`
    )
    return 1
  }

  if (json) {
    console.log(JSON.stringify(documents.length === 1 ? documents[0] : documents, null, 2))
    return 0
  }

  console.log(`\n${BOLD}Application state${RESET_COLOR}`)
  console.log(
    `${DIM}Grant ${grantCode} · SBI ${sbi} · ${documents.length} document${documents.length === 1 ? '' : 's'}${RESET_COLOR}`
  )
  for (const [index, document] of documents.entries()) {
    if (index > 0) {
      console.log('')
    }
    console.log(inspect(document, { colors: process.stdout.isTTY, depth: null, compact: false, sorted: false }))
  }
  console.log('')
  return 0
}

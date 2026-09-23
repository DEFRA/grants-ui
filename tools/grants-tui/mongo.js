import { spawnSync } from 'node:child_process'
import { ROOT } from './constants.js'

export const MONGO_SERVICE = process.env.GRANTS_UI_MONGO_SERVICE || 'mongodb'
export const MONGO_COMPOSE_FILE = process.env.GRANTS_UI_MONGO_COMPOSE_FILE || 'compose.infra.yml'

/** Build the `docker compose exec` args to run an mongosh script against `db` via stdin. */
export function mongoExecArgs(db) {
  return [
    'compose',
    '-f',
    MONGO_COMPOSE_FILE,
    'exec',
    '-T',
    MONGO_SERVICE,
    'mongosh',
    db,
    '--quiet',
    '--file',
    '/dev/stdin'
  ]
}

/**
 * Extract and JSON.parse the `marker`-prefixed result line mongosh printed,
 * ignoring any other mongosh output on surrounding lines.
 * @param {string} marker
 * @param {string} output
 * @param {string} [notFoundMessage]
 */
export function markedResult(marker, output, notFoundMessage = 'MongoDB returned no result') {
  const line = (output ?? '')
    .split('\n')
    .map((value) => value.trim())
    .find((value) => value.startsWith(marker))
  if (!line) {
    throw new Error(notFoundMessage)
  }
  return JSON.parse(line.slice(marker.length))
}

/** Run an mongosh script against `db` synchronously via `docker compose exec`, cwd=ROOT. */
export function runMongoSync(db, script, spawn = spawnSync) {
  return spawn('docker', mongoExecArgs(db), {
    cwd: ROOT,
    input: script,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe']
  })
}

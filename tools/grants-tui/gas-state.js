import { spawnSync } from 'node:child_process'

const MONGO_SERVICE = process.env.GRANTS_UI_MONGO_SERVICE || 'mongodb'
const MONGO_COMPOSE_FILE = process.env.GRANTS_UI_MONGO_COMPOSE_FILE || 'compose.infra.yml'
const GAS_DATABASE = 'fg-gas-backend'
const APPLICATIONS_COLLECTION = 'applications'
const GRANTS_COLLECTION = 'grants'
const RESULT_MARKER = 'GT_GAS_STATE_RESULT:'

/** Build a safely quoted mongosh script which returns GAS applications. */
export function buildApplicationsScript() {
  return (
    `const documents = db.getCollection(${JSON.stringify(APPLICATIONS_COLLECTION)})\n` +
    '.find({}, { code: 1, currentConfigVersion: 1, originalConfigVersion: 1, configVersion: 1, clientRef: 1, currentPhase: 1, currentStage: 1, currentStatus: 1 })\n' +
    '.sort({ updatedAt: -1, createdAt: -1, clientRef: 1 })\n' +
    '.toArray();\n' +
    `print(${JSON.stringify(RESULT_MARKER)} + EJSON.stringify(documents));\n`
  )
}

/** Build a safely quoted mongosh script which returns the selected grant definition. */
export function buildGrantScript(code, version) {
  const filter = { code, version }
  return (
    `const document = db.getCollection(${JSON.stringify(GRANTS_COLLECTION)}).findOne(${JSON.stringify(filter)}, { phases: 1 });\n` +
    `print(${JSON.stringify(RESULT_MARKER)} + EJSON.stringify(document));\n`
  )
}

/** Build a mongosh update script targeting the application document's _id. */
export function buildUpdateApplicationScript(applicationId, next) {
  return (
    `const applicationId = EJSON.deserialize(${JSON.stringify(applicationId)});\n` +
    `const result = db.getCollection(${JSON.stringify(APPLICATIONS_COLLECTION)}).updateOne({ _id: applicationId }, { $set: ${JSON.stringify(
      {
        currentPhase: next.phase,
        currentStage: next.stage,
        currentStatus: next.status
      }
    )} });\n` +
    `print(${JSON.stringify(RESULT_MARKER)} + EJSON.stringify(result));\n`
  )
}

/** @param {string} output */
export function parseGasStateResult(output) {
  const line = output
    .split('\n')
    .map((value) => value.trim())
    .find((value) => value.startsWith(RESULT_MARKER))
  if (!line) {
    throw new Error('GAS MongoDB returned no result')
  }
  return JSON.parse(line.slice(RESULT_MARKER.length))
}

export function runMongo(script, spawn = spawnSync) {
  const result = spawn(
    'docker',
    [
      'compose',
      '-f',
      MONGO_COMPOSE_FILE,
      'exec',
      '-T',
      MONGO_SERVICE,
      'mongosh',
      GAS_DATABASE,
      '--quiet',
      '--file',
      '/dev/stdin'
    ],
    { input: script, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
  )
  if (result.status !== 0 || result.error) {
    throw new Error(result.error?.message || result.stderr?.trim() || 'MongoDB is unavailable')
  }
  return parseGasStateResult(result.stdout ?? '')
}

/** @param {typeof spawnSync} [spawn] */
export function listGasApplications(spawn) {
  return runMongo(buildApplicationsScript(), spawn).map((application) => ({
    ...application,
    // Applications are pinned to a resolved config version. `configVersion` is
    // retained only for documents written before the split into original/current.
    version: application.currentConfigVersion ?? application.originalConfigVersion ?? application.configVersion
  }))
}

/** @param {{ code: string, version: string }} application @param {typeof spawnSync} [spawn] */
export function getGasGrant(application, spawn) {
  return runMongo(buildGrantScript(application.code, application.version), spawn)
}

/** @param {object} application @param {{ phase: string, stage: string, status: string }} next @param {typeof spawnSync} [spawn] */
export function updateGasApplication(application, next, spawn) {
  if (!application._id) {
    throw new Error('GAS application has no _id')
  }
  const result = runMongo(buildUpdateApplicationScript(application._id, next), spawn)
  if (result.matchedCount !== 1 || result.modifiedCount !== 1) {
    throw new Error('GAS application was not updated')
  }
}

/**
 * Flatten a GAS grant definition into the phase/stage/status choices an
 * application can validly transition to. GAS definitions use code-valued
 * objects, while accepting strings keeps this resilient to seed data too.
 * @param {{ phases?: unknown[] }} grant
 */
export function gasStatusChoices(grant) {
  const value = (entry, keys) => {
    if (typeof entry === 'string') {
      return entry
    }
    if (!entry || typeof entry !== 'object') {
      return undefined
    }
    return keys.map((key) => entry[key]).find((candidate) => typeof candidate === 'string')
  }
  const choices = []
  for (const phaseEntry of grant?.phases ?? []) {
    const phase = value(phaseEntry, ['code', 'phase', 'name'])
    const phaseRecord = /** @type {any} */ (phaseEntry)
    for (const stageEntry of Array.isArray(phaseRecord?.stages) ? phaseRecord.stages : []) {
      const stage = value(stageEntry, ['code', 'stage', 'name'])
      const stageRecord = /** @type {any} */ (stageEntry)
      for (const statusEntry of Array.isArray(stageRecord?.statuses) ? stageRecord.statuses : []) {
        const status = value(statusEntry, ['code', 'status', 'name'])
        if (phase && stage && status) {
          choices.push({ phase, stage, status })
        }
      }
    }
  }
  return choices
}

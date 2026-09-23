import { spawnSync } from 'node:child_process'
import { markedResult, runMongoSync } from './mongo.js'

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
  return markedResult(RESULT_MARKER, output, 'GAS MongoDB returned no result')
}

export function runMongo(script, spawn = spawnSync) {
  const result = runMongoSync(GAS_DATABASE, script, spawn)
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

/** mongosh snippet loading a GAS application by `_id`, throwing if it no longer exists. */
export function findApplicationSnippet(applicationId, varName = 'application') {
  return `const ${varName} = db.applications.findOne({ _id: EJSON.deserialize(${JSON.stringify(applicationId)}) });
    if (!${varName}) throw new Error('Application no longer exists');`
}

/**
 * Run a Node ESM script inside the running GAS container via `docker exec`.
 * @param {string} script
 * @param {{ spawn?: typeof spawnSync, timeoutMs?: number, fallbackMessage?: string }} [options]
 */
export function runGasNodeScript(
  script,
  { spawn = spawnSync, timeoutMs = 15000, fallbackMessage = 'Could not run GAS script' } = {}
) {
  const result = spawn(
    'docker',
    ['exec', '-i', process.env.GRANTS_UI_GAS_CONTAINER || 'gas', 'node', '--input-type=module'],
    { input: script, encoding: 'utf8', timeout: timeoutMs, stdio: ['pipe', 'pipe', 'pipe'] }
  )
  if (result.error || result.status !== 0) {
    throw new Error(result.error?.message || result.stderr?.trim() || fallbackMessage)
  }
  return result
}

/**
 * Send a CloudEvent to a GAS SQS queue via the running GAS container's AWS SDK.
 * @param {{ id: string, data: Record<string, unknown> }} event
 * @param {string} queueEnvironmentName
 * @param {{ spawn?: typeof spawnSync, fallbackMessage?: string }} [options]
 */
export function queueGasEvent(
  event,
  queueEnvironmentName,
  { spawn = spawnSync, fallbackMessage = 'Could not queue GAS event' } = {}
) {
  const script = `
    import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
    const queueUrl = process.env[${JSON.stringify(queueEnvironmentName)}];
    if (!queueUrl) throw new Error('GAS queue is not configured: ${queueEnvironmentName}');
    const client = new SQSClient({ region: process.env.AWS_REGION || 'eu-west-2', endpoint: process.env.AWS_ENDPOINT_URL, maxAttempts: 1 });
    try {
      await client.send(new SendMessageCommand({ QueueUrl: queueUrl,
        MessageBody: ${JSON.stringify(JSON.stringify(event))},
        MessageGroupId: ${JSON.stringify(`${event.data.code ?? event.data.workflowCode}-${event.data.clientRef ?? event.data.caseRef}`)},
        MessageDeduplicationId: ${JSON.stringify(event.id)}
      }), { abortSignal: AbortSignal.timeout(10000) });
    } finally { client.destroy(); }
  `
  runGasNodeScript(script, { spawn, fallbackMessage })
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

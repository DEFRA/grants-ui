import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { runMongo } from './gas-state.js'

/** Read fresh state and resolve the latest active grant within the application's major, as GAS does. */
export function getGasOfferContext(application, spawn) {
  if (!application._id) {
    throw new Error('GAS application has no _id')
  }
  return runMongo(
    `const application = db.applications.findOne({ _id: EJSON.deserialize(${JSON.stringify(application._id)}) });
    if (!application) throw new Error('Application no longer exists');
    const pinned = application.currentConfigVersion ?? application.originalConfigVersion ?? application.configVersion;
    const version = pinned ? db.config_versions.findOne({
      grantCode: application.code, major: Number(pinned.split('.')[0]), status: 'active',
      'definitions.grant.fetchStatus': { $ne: 'permanent_error' }
    }, {}, { sort: { minor: -1, patch: -1 } }) : null;
    if (pinned && !version) throw new Error('No active GAS config version found');
    const grant = db.grants.findOne({ code: application.code, version: version?.version ?? '0.0.0' },
      { phases: 1, externalStatusMap: 1 });
    if (!grant) throw new Error('Resolved grant definition is not cached in GAS yet');
    const agreement = db.agreements__agreements.findOne({ code: application.code, clientRef: application.clientRef },
      { _id: 1 });
    print('GT_GAS_STATE_RESULT:' + EJSON.stringify({
      application: { _id: application._id, code: application.code, clientRef: application.clientRef,
        currentPhase: application.currentPhase, currentStage: application.currentStage, currentStatus: application.currentStatus },
      grant, agreement
    }));`,
    spawn
  )
}

/** Find the CW event whose transition runs GENERATE_OFFER from the current position. */
export function gasOfferAction({ application, grant, agreement }) {
  if (agreement) {
    return { reason: 'An agreement already exists; generation would not repopulate it' }
  }
  const { currentPhase, currentStage, currentStatus } = application
  const current = `${currentPhase}:${currentStage}:${currentStatus}`
  const mappings =
    grant?.externalStatusMap?.phases
      ?.find((phase) => phase.code === currentPhase)
      ?.stages?.find((stage) => stage.code === currentStage)?.statuses ?? []
  const candidates = mappings.filter((mapping) => {
    if (mapping.source !== 'CW' || !mapping.mappedTo) {
      return false
    }
    const target =
      mapping.mappedTo.startsWith('::') || !mapping.mappedTo.includes(':')
        ? [currentPhase, currentStage, mapping.mappedTo.replace(/^::/, '')]
        : mapping.mappedTo.split(':')
    const status = grant.phases
      ?.find((phase) => phase.code === target[0])
      ?.stages?.find((stage) => stage.code === target[1])
      ?.statuses?.find((entry) => entry.code === target[2])
    if (!status) {
      return false
    }
    const processes = status.validFrom?.length
      ? status.validFrom.find((entry) => entry.code === (entry.code.includes(':') ? current : currentStatus))?.processes
      : status.processes
    return processes?.includes('GENERATE_OFFER')
  })
  if (candidates.length !== 1) {
    return {
      reason: candidates.length
        ? 'Multiple offer transitions are configured'
        : 'No GENERATE_OFFER transition from the current status'
    }
  }
  return { status: candidates[0].code }
}

/** Queue the event using the running GAS container's AWS SDK and queue configuration. */
export function generateGasOffer(application, { spawn = spawnSync, dryRun = false } = {}) {
  const context = getGasOfferContext(application, spawn)
  const action = gasOfferAction(context)
  if (!action.status) {
    throw new Error(action.reason)
  }
  const event = {
    id: randomUUID(),
    specversion: '1.0',
    time: new Date().toISOString(),
    type: 'fg.cw-backend.test.case.status.updated',
    source: 'CW',
    data: {
      caseRef: context.application.clientRef,
      workflowCode: context.application.code,
      currentStatus: action.status
    }
  }
  if (dryRun) {
    return { event, dryRun: true }
  }
  const script = `
    import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
    const queueUrl = process.env.GAS__SQS__UPDATE_STATUS_QUEUE_URL;
    if (!queueUrl) throw new Error('GAS status queue is not configured');
    const client = new SQSClient({ region: process.env.AWS_REGION || 'eu-west-2', endpoint: process.env.AWS_ENDPOINT_URL, maxAttempts: 1 });
    try {
      await client.send(new SendMessageCommand({ QueueUrl: queueUrl,
        MessageBody: ${JSON.stringify(JSON.stringify(event))},
        MessageGroupId: ${JSON.stringify(`${event.data.workflowCode}-${event.data.caseRef}`)},
        MessageDeduplicationId: ${JSON.stringify(event.id)}
      }), { abortSignal: AbortSignal.timeout(10000) });
    } finally { client.destroy(); }
  `
  const result = spawn(
    'docker',
    ['exec', '-i', process.env.GRANTS_UI_GAS_CONTAINER || 'gas', 'node', '--input-type=module'],
    {
      input: script,
      encoding: 'utf8',
      timeout: 15000,
      stdio: ['pipe', 'pipe', 'pipe']
    }
  )
  if (result.error || result.status !== 0) {
    throw new Error(result.error?.message || result.stderr?.trim() || 'Could not queue offer generation')
  }
  return { event, dryRun: false }
}

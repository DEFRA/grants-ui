import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { runMongo, updateGasApplication } from './gas-state.js'

export const CLAIM_POSITION = {
  phase: 'PHASE_PRE_AWARD',
  stage: 'STAGE_PREPARE_CLAIM',
  status: 'STATUS_PREPARING_CLAIM'
}
export const AWAITING_CLAIM_POSITION = {
  phase: 'PHASE_CLAIM',
  stage: 'STAGE_AWAITING_CLAIM',
  status: 'STATUS_AWAITING_CLAIM'
}

const OFFERED_POSITION = {
  phase: 'PHASE_PRE_AWARD',
  stage: 'STAGE_AGREEMENT_WITH_APPLICANT',
  status: 'STATUS_AGREEMENT_OFFERED'
}
const ACCEPTED_POSITION = {
  phase: 'PHASE_PRE_AWARD',
  stage: 'STAGE_AGREEMENT_ACCEPTED',
  status: 'STATUS_AGREEMENT_ACCEPTED'
}
const COMPLETED_POSITION = {
  phase: 'PHASE_PRE_AWARD',
  stage: 'STAGE_APPLICATION_COMPLETED',
  status: 'STATUS_APPLICATION_COMPLETED'
}

const positionEquals = (application, position) =>
  application.currentPhase === position.phase &&
  application.currentStage === position.stage &&
  application.currentStatus === position.status

function readApplication(application, spawn) {
  if (!application._id) {
    throw new Error('GAS application has no _id')
  }
  return runMongo(
    `const application = db.applications.findOne({ _id: EJSON.deserialize(${JSON.stringify(application._id)}) });
     if (!application) throw new Error('Application no longer exists');
     print('GT_GAS_STATE_RESULT:' + EJSON.stringify(application));`,
    spawn
  )
}

function pause(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds)
}

function waitForPosition(application, position, spawn) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const current = readApplication(application, spawn)
    if (positionEquals(current, position)) {
      return current
    }
    pause(250)
  }
  throw new Error(`Timed out waiting for ${position.phase} > ${position.stage} > ${position.status}`)
}

function queueEvent(event, queueEnvironmentName, spawn) {
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
  const result = spawn(
    'docker',
    ['exec', '-i', process.env.GRANTS_UI_GAS_CONTAINER || 'gas', 'node', '--input-type=module'],
    { input: script, encoding: 'utf8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'] }
  )
  if (result.error || result.status !== 0) {
    throw new Error(result.error?.message || result.stderr?.trim() || 'Could not queue GAS event')
  }
}

function createAdminEntitlement(application, totalHectares, spawn) {
  const request = {
    clientRef: application.clientRef,
    grantCode: application.code,
    claimCode: 'ENT_CS_CAPITAL_PA3',
    // GAS entitlement decimals are represented in ten-thousandths. The
    // application answer is ordinary hectares (for example 66.2516).
    data: { totalHectares: { value: Math.round(totalHectares * 10_000) } }
  }
  // This is the mint-access-token script's equivalent. The raw token is never
  // printed or persisted in the repository; its temporary hash is removed after the request.
  const script = `
    import { createHash, randomUUID } from 'node:crypto';
    import { MongoClient } from 'mongodb';
    const rawToken = randomUUID();
    const tokenId = createHash('sha256').update(rawToken, 'utf8').digest('hex');
    const client = new MongoClient(process.env.MONGO_URI);
    await client.connect();
    const tokens = client.db(process.env.MONGO_DATABASE).collection('access_tokens');
    try {
      await tokens.insertOne({ id: tokenId, client: 'fg-grants-platform-admin', clientId: 'fg-grants-platform-admin',
        expiresAt: new Date(Date.now() + 60000) });
      const response = await fetch('http://127.0.0.1:' + (process.env.PORT || '3102') +
        '/grant-admin/grants/${application.code}/applications/${application.clientRef}/claims/entitlements', {
          method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + rawToken },
          body: ${JSON.stringify(JSON.stringify(request))}
        });
      const body = await response.text();
      if (!response.ok) throw new Error('Entitlement API returned ' + response.status + ': ' + body);
      console.log('GT_GAS_STATE_RESULT:' + body);
    } finally {
      await tokens.deleteOne({ id: tokenId });
      await client.close();
    }
  `
  const result = spawn(
    'docker',
    ['exec', '-i', process.env.GRANTS_UI_GAS_CONTAINER || 'gas', 'node', '--input-type=module'],
    { input: script, encoding: 'utf8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] }
  )
  if (result.error || result.status !== 0) {
    throw new Error(result.error?.message || result.stderr?.trim() || 'Could not create entitlement')
  }
  const marker = 'GT_GAS_STATE_RESULT:'
  const line = (result.stdout ?? '').split('\n').find((value) => value.startsWith(marker))
  if (!line) {
    throw new Error('Entitlement API returned no result')
  }
  return JSON.parse(line.slice(marker.length))
}

/** Progress an offered woodland agreement through the local claim-preparation fixture flow. */
export function prepareGasClaim(application, { spawn = spawnSync, dryRun = false } = {}) {
  const current = readApplication(application, spawn)
  const alreadyPrepared = positionEquals(current, CLAIM_POSITION)
  const agreement = Object.values(current.agreements ?? {}).find((entry) =>
    ['OFFERED', 'ACCEPTED'].includes(entry.latestStatus)
  )
  if (
    !alreadyPrepared &&
    !positionEquals(current, {
      phase: 'PHASE_PRE_AWARD',
      stage: 'STAGE_PREPARING_AGREEMENT',
      status: 'STATUS_AGREEMENT_READY_FOR_APPLICANT'
    })
  ) {
    throw new Error('Application must be at STATUS_AGREEMENT_READY_FOR_APPLICANT or STATUS_PREPARING_CLAIM')
  }
  if (!agreement) {
    throw new Error('Application has no offered or accepted agreement')
  }
  const totalHectares = current.phases
    ?.flatMap((phase) => [phase.answers ?? {}])
    .find((answers) => Number.isFinite(answers.totalHectaresForSelectedParcels))?.totalHectaresForSelectedParcels
  if (!Number.isFinite(totalHectares)) {
    throw new Error('Application has no totalHectaresForSelectedParcels answer')
  }

  const now = new Date().toISOString()
  const cwEvent = (currentStatus) => ({
    id: randomUUID(),
    specversion: '1.0',
    time: now,
    type: 'fg.cw-backend.test.case.status.updated',
    source: 'CW',
    data: { caseRef: current.clientRef, workflowCode: current.code, currentStatus }
  })
  const offered = cwEvent(`${OFFERED_POSITION.phase}:${OFFERED_POSITION.stage}:${OFFERED_POSITION.status}`)
  const accepted = {
    id: randomUUID(),
    specversion: '1.0',
    time: now,
    type: 'io.onsite.agreement.status.updated',
    source: 'urn:service:agreement',
    data: {
      agreementNumber: agreement.agreementRef,
      clientRef: current.clientRef,
      code: current.code,
      status: 'accepted',
      date: now,
      startDate: now,
      endDate: now
    }
  }
  const completed = cwEvent(`${COMPLETED_POSITION.phase}:${COMPLETED_POSITION.stage}:${COMPLETED_POSITION.status}`)
  if (dryRun) {
    return { dryRun: true, events: { offered, accepted, completed }, totalHectares }
  }

  if (!alreadyPrepared) {
    queueEvent(offered, 'GAS__SQS__UPDATE_STATUS_QUEUE_URL', spawn)
    waitForPosition(application, OFFERED_POSITION, spawn)
    queueEvent(accepted, 'GAS__SQS__UPDATE_AGREEMENT_STATUS_QUEUE_URL', spawn)
    waitForPosition(application, ACCEPTED_POSITION, spawn)
    queueEvent(completed, 'GAS__SQS__UPDATE_STATUS_QUEUE_URL', spawn)
    const completedApplication = waitForPosition(application, COMPLETED_POSITION, spawn)
    updateGasApplication(completedApplication, CLAIM_POSITION, spawn)
  }
  const entitlement = createAdminEntitlement({ ...current, ...CLAIM_POSITION }, totalHectares, spawn)
  updateGasApplication({ ...current, ...CLAIM_POSITION }, AWAITING_CLAIM_POSITION, spawn)
  return { dryRun: false, entitlement, totalHectares }
}

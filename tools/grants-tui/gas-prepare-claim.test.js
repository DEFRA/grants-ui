// @vitest-environment node
import { expect, test, vi } from 'vitest'
import { AWAITING_CLAIM_POSITION, CLAIM_POSITION, prepareGasClaim } from './gas-prepare-claim.js'

const application = {
  _id: 'application-id',
  code: 'woodland',
  clientRef: 'wmp-test-ref',
  currentPhase: 'PHASE_PRE_AWARD',
  currentStage: 'STAGE_PREPARING_AGREEMENT',
  currentStatus: 'STATUS_AGREEMENT_READY_FOR_APPLICANT',
  agreements: { WMP1: { agreementRef: 'WMP1', latestStatus: 'OFFERED' } },
  phases: [{ answers: { totalHectaresForSelectedParcels: 50 } }]
}

test('dry run validates the ready application and exposes the three lifecycle events', () => {
  const spawn = vi
    .fn()
    .mockReturnValueOnce({ status: 0, stdout: `GT_GAS_STATE_RESULT:${JSON.stringify(application)}\n` })
    .mockReturnValueOnce({
      status: 0,
      stdout: 'GT_GAS_STATE_RESULT:"cloud.defra.local.fg-cw-backend.case.status.updated"\n'
    })
  const result = prepareGasClaim(application, { spawn, dryRun: true })

  expect(result.totalHectares).toBe(50)
  if (!result.events) {
    throw new Error('Dry run did not return lifecycle events')
  }
  expect(result.events.offered.data.currentStatus).toBe(
    'PHASE_PRE_AWARD:STAGE_AGREEMENT_WITH_APPLICANT:STATUS_AGREEMENT_OFFERED'
  )
  expect(result.events.accepted.data).toMatchObject({ agreementNumber: 'WMP1', status: 'accepted' })
  expect(result.events.offered.type).toBe('cloud.defra.local.fg-cw-backend.case.status.updated')
  expect(result.events.completed.type).toBe(result.events.offered.type)
  expect(result.events.accepted.type).toBe('io.onsite.agreement.status.updated')
  expect(result.events.completed.data.currentStatus).toBe(
    'PHASE_PRE_AWARD:STAGE_APPLICATION_COMPLETED:STATUS_APPLICATION_COMPLETED'
  )
  expect(spawn).toHaveBeenCalledTimes(2)
})

test('claim target is the configured prepare-claim position', () => {
  expect(CLAIM_POSITION).toEqual({
    phase: 'PHASE_PRE_AWARD',
    stage: 'STAGE_PREPARE_CLAIM',
    status: 'STATUS_PREPARING_CLAIM'
  })
})

test('successful entitlement creation ends at the awaiting-claim position', () => {
  expect(AWAITING_CLAIM_POSITION).toEqual({
    phase: 'PHASE_CLAIM',
    stage: 'STAGE_AWAITING_CLAIM',
    status: 'STATUS_AWAITING_CLAIM'
  })
})

test('admin entitlement values use GAS decimal storage units', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) =>
    readFile(new URL('./gas-prepare-claim.js', import.meta.url), 'utf8')
  )
  expect(source).toContain('Math.round(totalHectares * 10_000)')
  expect(source).toContain("console.log('GT_GAS_STATE_RESULT:' + body)")
})

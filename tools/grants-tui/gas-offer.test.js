// @vitest-environment node
import { describe, expect, test, vi } from 'vitest'
import { runInNewContext } from 'node:vm'
import { gasOfferAction, generateGasOffer, getGasOfferContext } from './gas-offer.js'

test('resolves the pinned major using mongosh sort options before looking up the grant', () => {
  const context = fixture()
  const findVersion = vi.fn(() => ({ version: '1.3.2' }))
  const findGrant = vi.fn(() => context.grant)
  const spawn = vi.fn((_command, _args, options) => {
    let stdout
    runInNewContext(options.input, {
      db: {
        applications: { findOne: () => ({ ...context.application, currentConfigVersion: '1.0.0' }) },
        config_versions: { findOne: findVersion },
        grants: { findOne: findGrant },
        agreements__agreements: { findOne: () => null }
      },
      EJSON: { deserialize: (value) => value, stringify: JSON.stringify },
      print: (value) => {
        stdout = value
      }
    })
    return { status: 0, stdout }
  })

  getGasOfferContext(context.application, spawn)

  expect(findVersion).toHaveBeenCalledWith(
    { grantCode: 'woodland', major: 1, status: 'active', 'definitions.grant.fetchStatus': { $ne: 'permanent_error' } },
    {},
    { sort: { minor: -1, patch: -1 } }
  )
  expect(findGrant).toHaveBeenCalledWith({ code: 'woodland', version: '1.3.2' }, { phases: 1, externalStatusMap: 1 })
})

function fixture() {
  return {
    application: {
      _id: 'test-id',
      code: 'woodland',
      clientRef: 'test-ref',
      currentPhase: 'PRE',
      currentStage: 'REVIEW',
      currentStatus: 'RECEIVED'
    },
    agreement: null,
    grant: {
      phases: [
        {
          code: 'PRE',
          stages: [
            {
              code: 'REVIEW',
              statuses: [
                {
                  code: 'GENERATING',
                  validFrom: [{ code: 'RECEIVED', processes: ['GENERATE_OFFER'] }]
                }
              ]
            }
          ]
        }
      ],
      externalStatusMap: {
        phases: [
          {
            code: 'PRE',
            stages: [
              {
                code: 'REVIEW',
                statuses: [
                  {
                    code: 'APPROVED',
                    source: 'CW',
                    mappedTo: 'PRE:REVIEW:GENERATING'
                  }
                ]
              }
            ]
          }
        ]
      }
    }
  }
}

describe('offer transition selection', () => {
  test.each(['PRE:REVIEW:GENERATING', '::GENERATING', 'GENERATING'])(
    'resolves mapping %s to the CW event code',
    (mappedTo) => {
      const context = fixture()
      context.grant.externalStatusMap.phases[0].stages[0].statuses[0].mappedTo = mappedTo
      expect(gasOfferAction(context)).toEqual({ status: 'APPROVED' })
    }
  )

  test('matches fully qualified validFrom and processes on unrestricted transitions', () => {
    const context = fixture()
    const status = context.grant.phases[0].stages[0].statuses[0]
    status.validFrom[0].code = 'PRE:REVIEW:RECEIVED'
    expect(gasOfferAction(context).status).toBe('APPROVED')
    status.validFrom = []
    Object.assign(status, { processes: ['GENERATE_OFFER'] })
    expect(gasOfferAction(context).status).toBe('APPROVED')
  })

  test('refuses existing agreements and invalid application positions', () => {
    const context = fixture()
    expect(gasOfferAction({ ...context, agreement: { _id: 'existing' } }).reason).toContain('already exists')
    context.application.currentStatus = 'PREPARING_CLAIM'
    expect(gasOfferAction(context).reason).toContain('No GENERATE_OFFER')
  })

  test('does not use a different source, stage or transition without the offer process', () => {
    const context = fixture()
    const mapping = context.grant.externalStatusMap.phases[0].stages[0].statuses[0]
    mapping.source = 'AS'
    expect(gasOfferAction(context).status).toBeUndefined()
    mapping.source = 'CW'
    context.grant.phases[0].stages[0].statuses[0].validFrom[0].processes = []
    expect(gasOfferAction(context).status).toBeUndefined()
    context.application.currentStage = 'OTHER'
    expect(gasOfferAction(context).status).toBeUndefined()
  })

  test('refuses ambiguous mappings', () => {
    const context = fixture()
    const mappings = context.grant.externalStatusMap.phases[0].stages[0].statuses
    mappings.push({ ...mappings[0], code: 'ANOTHER_APPROVAL' })
    expect(gasOfferAction(context).reason).toContain('Multiple')
  })
})

function mockSpawn(context = fixture(), eventType = 'cloud.defra.local.fg-cw-backend.case.status.updated') {
  return vi
    .fn()
    .mockReturnValueOnce({ status: 0, stdout: `GT_GAS_STATE_RESULT:${JSON.stringify(context)}\n` })
    .mockReturnValueOnce({ status: 0, stdout: `GT_GAS_STATE_RESULT:${JSON.stringify(eventType)}\n` })
    .mockReturnValue({ status: 0 })
}

test.each(['local', 'dev'])(
  'queues a fresh event using the GAS %s event contract and current DB identity',
  (environment) => {
    const eventType = `cloud.defra.${environment}.fg-cw-backend.case.status.updated`
    const spawn = mockSpawn(fixture(), eventType)
    const { event } = generateGasOffer({ _id: 'test-id', code: 'stale', clientRef: 'stale' }, { spawn })
    expect(event.data).toEqual({ workflowCode: 'woodland', caseRef: 'test-ref', currentStatus: 'APPROVED' })
    expect(event.id).toMatch(/^[\da-f-]{36}$/)
    expect(event.type).toBe(eventType)
    expect(spawn.mock.calls[2][1]).toEqual(['exec', '-i', 'gas', 'node', '--input-type=module'])
    const script = spawn.mock.calls[2][2].input
    expect(script).toContain('process.env["GAS__SQS__UPDATE_STATUS_QUEUE_URL"]')
    expect(script).toContain('MessageDeduplicationId: "' + event.id + '"')
    expect(script).toContain(JSON.stringify(JSON.stringify(event)))
    expect(generateGasOffer(fixture().application, { spawn: mockSpawn() }).event.id).not.toBe(event.id)
  }
)

test('dry run reads state but sends nothing', () => {
  const spawn = mockSpawn()
  expect(generateGasOffer(fixture().application, { spawn, dryRun: true })).toMatchObject({
    dryRun: true,
    event: { type: 'cloud.defra.local.fg-cw-backend.case.status.updated' }
  })
  expect(spawn).toHaveBeenCalledTimes(2)
})

test('stale selection cannot queue when the database position has changed', () => {
  const context = fixture()
  context.application.currentStatus = 'GENERATING'
  const spawn = mockSpawn(context)
  expect(() => generateGasOffer(fixture().application, { spawn })).toThrow('No GENERATE_OFFER')
  expect(spawn).toHaveBeenCalledTimes(1)
})

test('reports SQS delivery errors instead of claiming success', () => {
  const spawn = mockSpawn()
  spawn.mockReturnValue({ status: 1, stderr: 'Queue unavailable' })
  expect(() => generateGasOffer(fixture().application, { spawn })).toThrow('Queue unavailable')
})

test('does not queue an offer when the GAS event contract cannot be resolved', () => {
  const spawn = vi
    .fn()
    .mockReturnValueOnce({ status: 0, stdout: `GT_GAS_STATE_RESULT:${JSON.stringify(fixture())}\n` })
    .mockReturnValueOnce({ status: 1, stderr: 'GAS contract unavailable' })
  expect(() => generateGasOffer(fixture().application, { spawn })).toThrow('GAS contract unavailable')
  expect(spawn).toHaveBeenCalledTimes(2)
})

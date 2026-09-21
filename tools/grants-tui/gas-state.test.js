import { describe, expect, test, vi } from 'vitest'
import { ROOT } from './constants.js'

import {
  buildApplicationsScript,
  buildGrantScript,
  buildUpdateApplicationScript,
  gasStatusChoices,
  listGasApplications,
  parseGasStateResult,
  updateGasApplication
} from './gas-state.js'

test('application query reads the fields displayed by the GAS state tool', () => {
  const script = buildApplicationsScript()

  expect(script).toContain('getCollection("applications")')
  expect(script).toContain(
    'code: 1, currentConfigVersion: 1, originalConfigVersion: 1, configVersion: 1, clientRef: 1, currentPhase: 1, currentStage: 1, currentStatus: 1'
  )
})

test('grant query safely quotes code and version', () => {
  const script = buildGrantScript('grant"; db.dropDatabase()', '1.0.0')

  expect(script).toContain('.findOne({"code":"grant\\"; db.dropDatabase()","version":"1.0.0"}')
  expect(script).not.toContain('\ndb.dropDatabase()')
})

test('update targets one application _id and changes all GAS state fields together', () => {
  const script = buildUpdateApplicationScript(
    { $oid: '507f1f77bcf86cd799439011' },
    {
      phase: 'ASSESSMENT',
      stage: 'CHECKS',
      status: 'PASSED'
    }
  )

  expect(script).toContain('EJSON.deserialize({"$oid":"507f1f77bcf86cd799439011"})')
  expect(script).toContain('currentPhase":"ASSESSMENT"')
  expect(script).toContain('currentStage":"CHECKS"')
  expect(script).toContain('currentStatus":"PASSED"')
})

test('parses only the marked Mongosh result', () => {
  expect(parseGasStateResult('warning\nGT_GAS_STATE_RESULT:[{"code":"EGWA"}]\n')).toEqual([{ code: 'EGWA' }])
})

describe('gasStatusChoices', () => {
  test('flattens phase, stage and status values in definition order', () => {
    expect(
      gasStatusChoices({
        phases: [
          {
            code: 'REVIEW',
            stages: [{ code: 'ELIGIBILITY', statuses: [{ code: 'PENDING' }, { code: 'PASSED' }] }]
          },
          { code: 'OFFER', stages: [{ code: 'DECISION', statuses: ['OFFERED'] }] }
        ]
      })
    ).toEqual([
      { phase: 'REVIEW', stage: 'ELIGIBILITY', status: 'PENDING' },
      { phase: 'REVIEW', stage: 'ELIGIBILITY', status: 'PASSED' },
      { phase: 'OFFER', stage: 'DECISION', status: 'OFFERED' }
    ])
  })

  test('includes claim positions from the selected grant version', () => {
    expect(
      gasStatusChoices({
        phases: [
          {
            code: 'PHASE_CLAIM',
            stages: [{ code: 'STAGE_PREPARE_CLAIM', statuses: [{ code: 'STATUS_PREPARING_CLAIM' }] }]
          }
        ]
      })
    ).toContainEqual({
      phase: 'PHASE_CLAIM',
      stage: 'STAGE_PREPARE_CLAIM',
      status: 'STATUS_PREPARING_CLAIM'
    })
  })
})

test('Mongo helpers use the GAS database and reject an unmatched update', () => {
  const spawn = vi.fn().mockReturnValue({
    status: 0,
    stdout: 'GT_GAS_STATE_RESULT:[{"code":"EGWA","currentConfigVersion":"1.2.3"}]\n',
    stderr: ''
  })
  expect(listGasApplications(spawn)).toEqual([{ code: 'EGWA', currentConfigVersion: '1.2.3', version: '1.2.3' }])
  expect(spawn).toHaveBeenCalledWith(
    'docker',
    expect.arrayContaining([
      'compose',
      '-f',
      'compose.infra.yml',
      'exec',
      '-T',
      'mongodb',
      'mongosh',
      'fg-gas-backend'
    ]),
    expect.objectContaining({ cwd: ROOT })
  )

  const unmatched = vi
    .fn()
    .mockReturnValue({ status: 0, stdout: 'GT_GAS_STATE_RESULT:{"matchedCount":0,"modifiedCount":0}\n' })
  expect(() =>
    updateGasApplication(
      { _id: { $oid: '507f1f77bcf86cd799439011' } },
      { phase: 'A', stage: 'B', status: 'C' },
      unmatched
    )
  ).toThrow('was not updated')
})

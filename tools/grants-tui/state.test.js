import { describe, expect, test, vi } from 'vitest'

import { buildStateQuery, buildStateScript, cmdState, parseStateResult } from './state.js'

describe('buildStateQuery', () => {
  test('builds an SBI and grant-code filter', () => {
    expect(buildStateQuery({ grantCode: 'example-grant', sbi: 123456789 })).toEqual({
      grantCode: 'example-grant',
      sbi: '123456789'
    })
  })

  test('includes an exact grant version when supplied', () => {
    expect(buildStateQuery({ grantCode: 'example-grant', sbi: '123456789', grantVersion: '2.3.4' })).toEqual({
      grantCode: 'example-grant',
      sbi: '123456789',
      grantVersion: '2.3.4'
    })
  })
})

test('buildStateScript creates a read-only, safely quoted query', () => {
  const script = buildStateScript({ grantCode: 'grant"; db.dropDatabase(); //', sbi: '123' })

  expect(script).toContain('.find({"grantCode":"grant\\"; db.dropDatabase(); //","sbi":"123"})')
  expect(script).toContain('.sort({ major: -1, minor: -1, patch: -1, updatedAt: -1 })')
  expect(script).not.toContain('\ndb.dropDatabase()')
})

test('parseStateResult ignores incidental mongosh output', () => {
  expect(parseStateResult('notice\nGT_STATE_RESULT:[{"grantCode":"EGWA"}]\n')).toEqual([{ grantCode: 'EGWA' }])
})

describe('cmdState', () => {
  test('queries Mongo and prints JSON', () => {
    const spawn = vi.fn().mockReturnValue({
      status: 0,
      stdout: 'GT_STATE_RESULT:[{"sbi":"123","grantCode":"EGWA","state":{"answer":true}}]\n',
      stderr: ''
    })
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    expect(cmdState({ grantCode: 'EGWA', sbi: '123', json: true }, spawn)).toBe(0)
    expect(spawn).toHaveBeenCalledWith(
      'docker',
      expect.arrayContaining(['compose', '-f', 'compose.infra.yml', 'exec', '-T', 'mongodb', 'mongosh']),
      expect.objectContaining({ input: expect.stringContaining('state__grant_application_state') })
    )
    expect(log).toHaveBeenCalledWith(expect.stringContaining('"answer": true'))
  })

  test('returns 1 when no matching state exists', () => {
    const spawn = vi.fn().mockReturnValue({ status: 0, stdout: 'GT_STATE_RESULT:[]\n', stderr: '' })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(cmdState({ grantCode: 'EGWA', sbi: '123' }, spawn)).toBe(1)
  })

  test('returns 2 when required arguments are missing', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(cmdState({ grantCode: 'EGWA', sbi: '' }, vi.fn())).toBe(2)
  })
})

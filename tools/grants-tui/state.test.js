import { describe, expect, test, vi } from 'vitest'

import {
  buildStateCatalogScript,
  buildStateQuery,
  buildStateScript,
  cmdState,
  fetchState,
  fetchStateCatalog,
  parseStateResult
} from './state.js'

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

test('catalog fetch projects only selection metadata from the state collection', async () => {
  const stdin = { on: vi.fn(), end: vi.fn() }
  const execute = vi.fn((_cmd, _args, _options, callback) => {
    callback(null, 'GT_STATE_RESULT:[{"grantCode":"example","sbi":"123456789","grantVersion":"1.0.0"}]', '')
    return { stdin }
  })
  const script = buildStateCatalogScript()
  expect(script).toContain('.find({}, { _id: 0, grantCode: 1, sbi: 1, grantVersion: 1 })')
  expect(script).toContain('state__grant_application_state')
  const rows = await fetchStateCatalog(new AbortController().signal, execute)
  expect(rows).toEqual([{ grantCode: 'example', sbi: '123456789', grantVersion: '1.0.0' }])
  expect(stdin.end).toHaveBeenCalledWith(script)
})

test.each(['notice only', 'GT_STATE_RESULT:invalid', 'GT_STATE_RESULT:{}', 'GT_STATE_RESULT:[null]'])(
  'rejects malformed MongoDB responses: %s',
  (output) => {
    expect(() => parseStateResult(output)).toThrow()
  }
)

test('async fetch uses the same safely quoted query, timeout and cancellation signal', async () => {
  const stdin = { on: vi.fn(), end: vi.fn() }
  const execute = vi.fn((_cmd, _args, _options, callback) => {
    callback(null, 'GT_STATE_RESULT:[{"grantVersion":"2.0.0"}]', '')
    return { stdin }
  })
  const signal = new AbortController().signal
  await expect(
    fetchState({ grantCode: 'example-grant', sbi: '123456789', grantVersion: '2.0.0' }, signal, execute)
  ).resolves.toEqual([{ grantVersion: '2.0.0' }])
  expect(execute).toHaveBeenCalledWith(
    'docker',
    expect.arrayContaining(['exec', '-T', 'mongodb']),
    expect.objectContaining({ signal, timeout: 30000 }),
    expect.any(Function)
  )
  expect(stdin.end).toHaveBeenCalledWith(
    expect.stringContaining('.find({"grantCode":"example-grant","sbi":"123456789","grantVersion":"2.0.0"})')
  )
})

test('async fetch reports a failed Docker process with an actionable error and cause', async () => {
  const cause = new Error('exit 1')
  const execute = vi.fn((_cmd, _args, _options, callback) => {
    callback(cause, '', 'service mongodb is not running')
    return {}
  })
  await expect(fetchState({ grantCode: 'example-grant', sbi: '123456789' }, undefined, execute)).rejects.toMatchObject({
    message: expect.stringContaining('Check Docker and the MongoDB service'),
    cause
  })
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

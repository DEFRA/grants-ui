import { describe, expect, test, vi } from 'vitest'
import { agreementGrantCode } from './agreement-grant-code.js'

const buildRequest = ({ grant, ref, session } = {}) => ({
  app: {},
  query: { ...(grant !== undefined && { grant }), ...(ref && { ref }) },
  yar: { get: vi.fn().mockReturnValue(session ?? null) },
  auth: { credentials: { sbi: '106000001' } }
})

const woodlandSession = { grantCode: 'woodland', sbi: '106000001' }

describe('agreementGrantCode', () => {
  test.each([
    ['an invalid grant code', 'water management!'],
    ['a repeated parameter', ['woodland', 'water-management']]
  ])('ignores %s on a multi-application URL and uses the session grant', (_, grant) => {
    expect(agreementGrantCode(buildRequest({ grant, ref: 'WM-123-456', session: woodlandSession }))).toBe('woodland')
  })

  test.each([
    [
      'the URL grant on a multi-application URL',
      { grant: 'water-management', ref: 'WM-123-456', session: woodlandSession },
      'water-management'
    ],
    [
      'the session grant when the URL has a ref but no grant',
      { ref: 'WM-123-456', session: woodlandSession },
      'woodland'
    ],
    [
      'the session grant when the URL has a grant but no ref',
      { grant: 'water-management', session: woodlandSession },
      'woodland'
    ],
    ['the session grant', { session: woodlandSession }, 'woodland'],
    ['nothing for another business session', { session: { grantCode: 'woodland', sbi: '999' } }, undefined],
    ['nothing without a URL grant or session', {}, undefined]
  ])('returns %s', (_, context, expected) => {
    expect(agreementGrantCode(buildRequest(context))).toBe(expected)
  })
})

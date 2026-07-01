import { getCacheKey, parseSessionKey } from './get-cache-key-helper.js'

describe('getCacheKey', () => {
  const FULL_CREDS = { crn: 'user123', sbi: 'business456' }

  const makeRequest = (credentials = FULL_CREDS, params = { slug: 'grant789' }) => ({
    auth: credentials === null ? {} : { credentials },
    ...(params === null ? {} : { params })
  })

  it('returns sbi and grantCode when all are present', () => {
    expect(getCacheKey(makeRequest())).toEqual({ sbi: 'business456', grantCode: 'grant789' })
  })

  it('throws error if userId is missing', () => {
    expect(() => getCacheKey(makeRequest({ sbi: 'business456' }))).toThrow('Missing CRN in credentials')
  })

  it('throws error if sbi is missing', () => {
    expect(() => getCacheKey(makeRequest({ crn: 'user123' }))).toThrow('Missing SBI in credentials')
  })

  it('throws error if auth.credentials is missing', () => {
    expect(() => getCacheKey(makeRequest(null))).toThrow('Missing auth credentials')
  })

  it('throws error if grantCode (params.slug) is missing', () => {
    expect(() => getCacheKey(makeRequest(FULL_CREDS, {}))).toThrow('Missing grantCode')
  })

  it('throws error if params is missing', () => {
    expect(() => getCacheKey(makeRequest(FULL_CREDS, null))).toThrow('Missing grantCode')
  })
})

describe('parseSessionKey', () => {
  it('parses a valid session key into its components', () => {
    const key = 'business456:grant789'
    const result = parseSessionKey(key)

    expect(result).toEqual({
      sbi: 'business456',
      grantCode: 'grant789'
    })
  })

  it('throws error for empty string', () => {
    expect(() => parseSessionKey('')).toThrow('Invalid session key')
  })

  it('throws error for non-string input', () => {
    expect(() => parseSessionKey(null)).toThrow('Invalid session key')
    expect(() => parseSessionKey(123)).toThrow('Invalid session key')
  })

  it('throws error for missing parts', () => {
    expect(() => parseSessionKey('sbi')).toThrow('Invalid session key format')
  })
})

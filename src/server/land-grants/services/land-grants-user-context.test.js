import { describe, expect, it } from 'vitest'
import { BaseError } from '~/src/server/common/utils/errors/BaseError.js'
import { getLandGrantsUserContext, validateLandGrantsUserContext } from './land-grants-user-context.js'

const validContext = {
  defraIdToken: 'defra-id-access-token',
  sbi: '123456789'
}

describe('getLandGrantsUserContext', () => {
  it('extracts the Defra ID token and SBI from authenticated credentials', () => {
    const request = {
      auth: {
        credentials: {
          token: validContext.defraIdToken,
          sbi: validContext.sbi
        }
      }
    }

    expect(getLandGrantsUserContext(request)).toEqual(validContext)
  })
})

describe('validateLandGrantsUserContext', () => {
  it.each([undefined, null, '', '   '])('rejects missing or blank Defra ID token: %s', (defraIdToken) => {
    expect(() => validateLandGrantsUserContext({ ...validContext, defraIdToken })).toThrow(
      'Missing Defra ID token in Land Grants user context'
    )
  })

  it.each([undefined, null, '', '   '])('rejects missing or blank SBI: %s', (sbi) => {
    expect(() => validateLandGrantsUserContext({ ...validContext, sbi })).toThrow(
      'Missing SBI in Land Grants user context'
    )
  })

  it('returns a validated context without changing the token', () => {
    expect(validateLandGrantsUserContext(validContext)).toEqual(validContext)
  })

  it.each([
    [{ ...validContext, defraIdToken: undefined }, 'Missing Defra ID token in Land Grants user context'],
    [{ ...validContext, sbi: undefined }, 'Missing SBI in Land Grants user context']
  ])('wraps validation failures in a BaseError', (context, message) => {
    expect(() => validateLandGrantsUserContext(context)).toThrow(BaseError)
    expect(() => validateLandGrantsUserContext(context)).toThrow(message)
  })
})

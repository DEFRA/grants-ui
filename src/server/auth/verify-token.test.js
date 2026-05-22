import { vi } from 'vitest'
import Jwt from '@hapi/jwt'
import Wreck from '@hapi/wreck'
import { getOidcConfig } from './get-oidc-config.js'
import { verifyToken } from './verify-token.js'
import { log } from '~/src/server/common/helpers/logging/log.js'

// Mock dependencies
vi.mock('@hapi/jwt')
vi.mock('./get-oidc-config.js')

// A minimal valid RSA public JWK (2048-bit) for use in tests
const mockJwk = {
  kty: 'RSA',
  n: 'pjdss8ZaDfEH6K6U7GeW2nxDqR4IP049fk1fK0lndimbMMVBdPv_hSpm8T8EtBDxrUdi1OHZfMhUixGyw-zqKseqagMZahScmB4YPQLQbhxov6J4XHEbrba5AgIAjyZiL9LxkaRfrxbNklyiR68W2ihbkd9GCLOyHrWLaXYwRWq_4WdytDSOD6-ZXSVLinOgm4SS1ekLFOwmuTNs4LRRreaqx9RB_4DA8-pBl8dalCDywytHg_42vQ',
  e: 'AQAB'
}

describe('verifyToken', () => {
  const mockToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature'
  const mockDecodedToken = {
    header: { alg: 'RS256' },
    payload: { sub: '1234567890' }
  }

  beforeEach(() => {
    vi.clearAllMocks()

    getOidcConfig.mockResolvedValue({ jwks_uri: 'https://example.com/jwks' })

    Wreck.get.mockResolvedValue({
      payload: {
        keys: [mockJwk]
      }
    })

    Jwt.token.decode.mockReturnValue(mockDecodedToken)
    Jwt.token.verify.mockReturnValue(true)
  })

  it('should fetch OIDC configuration to get jwks_uri', async () => {
    await verifyToken(mockToken)
    expect(getOidcConfig).toHaveBeenCalledTimes(1)
  })

  it('should fetch the JWKS from the jwks_uri', async () => {
    await verifyToken(mockToken)
    expect(Wreck.get).toHaveBeenCalledWith('https://example.com/jwks', {
      json: true
    })
  })

  it('should convert the first JWK to a PEM and pass it to token verify', async () => {
    await verifyToken(mockToken)
    expect(Jwt.token.verify).toHaveBeenCalledWith(
      mockDecodedToken,
      expect.objectContaining({
        key: expect.stringContaining('-----BEGIN PUBLIC KEY-----'),
        algorithm: 'RS256'
      })
    )
  })

  it('should decode the JWT token', async () => {
    await verifyToken(mockToken)
    expect(Jwt.token.decode).toHaveBeenCalledWith(mockToken)
  })

  it('should verify the token using a PEM key and RS256 algorithm', async () => {
    await verifyToken(mockToken)
    expect(Jwt.token.verify).toHaveBeenCalledWith(mockDecodedToken, expect.objectContaining({ algorithm: 'RS256' }))
  })

  it('should throw an error if the OIDC config fetch fails', async () => {
    getOidcConfig.mockRejectedValue(new Error('Failed to fetch OIDC config'))

    await expect(verifyToken(mockToken)).rejects.toThrow('Failed to fetch OIDC config')
  })

  it('should throw an error if the JWKS fetch fails', async () => {
    Wreck.get.mockRejectedValue(new Error('Failed to fetch JWKS'))

    await expect(verifyToken(mockToken)).rejects.toThrow('Failed to fetch JWKS')
  })

  it('should throw an error if token verification fails', async () => {
    Jwt.token.verify.mockImplementation(() => {
      throw new Error('Invalid token signature')
    })

    await expect(verifyToken(mockToken)).rejects.toThrow('Invalid token signature')
  })

  it('should throw an error when no keys are returned from JWKS', async () => {
    Wreck.get.mockResolvedValue({
      payload: {
        keys: []
      }
    })

    await expect(verifyToken(mockToken)).rejects.toThrow('No keys found in JWKS response')
  })

  test.each([
    {
      errorMessage: 'JWKS',
      stepValue: 'jwks_fetch'
    },
    {
      errorMessage: 'JWK',
      stepValue: 'jwk_conversion'
    },
    {
      errorMessage: 'decode',
      stepValue: 'token_decode'
    },
    {
      errorMessage: 'verify',
      stepValue: 'signature_verification'
    }
  ])(
    'Should log the correct step when an error occurs containing "$errorMessage"',
    async ({ errorMessage, stepValue }) => {
      Jwt.token.verify.mockImplementation(() => {
        throw new Error(errorMessage)
      })

      await expect(verifyToken('token')).rejects.toThrow(errorMessage)

      expect(log).toHaveBeenCalledTimes(1)
      expect(log).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          step: stepValue
        })
      )
    }
  )

  it('should handle token decode failure in error handler', async () => {
    Jwt.token.verify.mockImplementation(() => {
      throw new Error('Token verification failed')
    })

    Jwt.token.decode.mockReturnValueOnce(mockDecodedToken).mockImplementationOnce(() => {
      throw new Error('Token decode failed in error handler')
    })

    await expect(verifyToken(mockToken)).rejects.toThrow('Token verification failed')

    expect(log).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        step: 'token_decode_failed',
        userId: 'unknown'
      })
    )
  })
})

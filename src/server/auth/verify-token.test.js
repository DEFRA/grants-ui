import Jwt from '@hapi/jwt'
import Wreck from '@hapi/wreck'
import jose from 'node-jose'
import { getOidcConfig } from './get-oidc-config.js'
import { verifyToken } from './verify-token.js'

// Mock dependencies
jest.mock('@hapi/wreck')
jest.mock('@hapi/jwt')
jest.mock('node-jose')
jest.mock('./get-oidc-config.js')
jest.mock('~/src/server/common/helpers/logging/log.js', () => ({
  log: jest.fn(),
  LogCodes: {
    AUTH: {
      TOKEN_VERIFICATION_SUCCESS: { level: 'info', messageFunc: jest.fn() },
      TOKEN_VERIFICATION_FAILURE: { level: 'error', messageFunc: jest.fn() }
    }
  }
}))

describe('verifyToken', () => {
  // Sample test data
  const mockToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature'
  const mockJwk = { kty: 'RSA', n: 'test-n', e: 'test-e' }
  const mockPem = '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgk...\n-----END PUBLIC KEY-----'
  const mockDecodedToken = {
    header: { alg: 'RS256' },
    payload: { sub: '1234567890' }
  }
  const mockJoseKey = {
    toPEM: jest.fn().mockReturnValue(mockPem)
  }

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks()

    // Setup mock return values
    getOidcConfig.mockResolvedValue({ jwks_uri: 'https://example.com/jwks' })

    Wreck.get.mockResolvedValue({
      payload: {
        keys: [mockJwk]
      }
    })

    // Setup jose.JWK.asKey mock
    jose.JWK = {
      asKey: jest.fn().mockResolvedValue(mockJoseKey)
    }

    Jwt.token.decode.mockReturnValue(mockDecodedToken)
    Jwt.token.verify.mockReturnValue(true)

    // Reset the toPEM mock for each test
    mockJoseKey.toPEM.mockClear()
    mockJoseKey.toPEM.mockReturnValue(mockPem)
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

  it('should convert the first JWK to a key using jose.JWK.asKey', async () => {
    await verifyToken(mockToken)
    expect(jose.JWK.asKey).toHaveBeenCalledWith(mockJwk)
  })

  it('should decode the JWT token', async () => {
    await verifyToken(mockToken)
    expect(Jwt.token.decode).toHaveBeenCalledWith(mockToken)
  })

  it('should verify the token using the PEM key and RS256 algorithm', async () => {
    await verifyToken(mockToken)
    expect(mockJoseKey.toPEM).toHaveBeenCalled()
    expect(Jwt.token.verify).toHaveBeenCalledWith(mockDecodedToken, {
      key: mockPem,
      algorithm: 'RS256'
    })
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
    // Mock an empty keys array
    Wreck.get.mockResolvedValue({
      payload: {
        keys: []
      }
    })

    // jose.JWK.asKey should throw an error when given undefined
    jose.JWK.asKey.mockRejectedValue(new Error('Cannot convert undefined JWK to key'))

    await expect(verifyToken(mockToken)).rejects.toThrow('No keys found in JWKS response')
  })
})

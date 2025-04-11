import Jwt from '@hapi/jwt'
import Wreck from '@hapi/wreck'
import jwkToPem from 'jwk-to-pem'
import { getOidcConfig } from './get-oidc-config.js'
import { verifyToken } from './verify-token.js'

jest.mock('@hapi/wreck')
jest.mock('@hapi/jwt')
jest.mock('jwk-to-pem')
jest.mock('./get-oidc-config.js')

describe('verifyToken', () => {
  const mockToken =
    'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature'
  const mockJwk = { kty: 'RSA', n: 'test-n', e: 'test-e' }
  const mockPem =
    '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgk...\n-----END PUBLIC KEY-----'
  const mockDecodedToken = {
    header: { alg: 'RS256' },
    payload: { sub: '1234567890' }
  }

  beforeEach(() => {
    jest.clearAllMocks()

    getOidcConfig.mockResolvedValue({ jwks_uri: 'https://example.com/jwks' })

    Wreck.get.mockResolvedValue({
      payload: {
        keys: [mockJwk]
      }
    })

    jwkToPem.mockReturnValue(mockPem)

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

  it('should convert the first JWK to PEM format', async () => {
    await verifyToken(mockToken)
    expect(jwkToPem).toHaveBeenCalledWith(mockJwk)
  })

  it('should decode the JWT token', async () => {
    await verifyToken(mockToken)
    expect(Jwt.token.decode).toHaveBeenCalledWith(mockToken)
  })

  it('should verify the token using the PEM key and RS256 algorithm', async () => {
    await verifyToken(mockToken)
    expect(Jwt.token.verify).toHaveBeenCalledWith(mockDecodedToken, {
      key: mockPem,
      algorithm: 'RS256'
    })
  })

  it('should throw an error if the OIDC config fetch fails', async () => {
    getOidcConfig.mockRejectedValue(new Error('Failed to fetch OIDC config'))

    await expect(verifyToken(mockToken)).rejects.toThrow(
      'Failed to fetch OIDC config'
    )
  })

  it('should throw an error if the JWKS fetch fails', async () => {
    Wreck.get.mockRejectedValue(new Error('Failed to fetch JWKS'))

    await expect(verifyToken(mockToken)).rejects.toThrow('Failed to fetch JWKS')
  })

  it('should throw an error if token verification fails', async () => {
    Jwt.token.verify.mockImplementation(() => {
      throw new Error('Invalid token signature')
    })

    await expect(verifyToken(mockToken)).rejects.toThrow(
      'Invalid token signature'
    )
  })

  it('should throw an error when no keys are returned from JWKS', async () => {
    Wreck.get.mockResolvedValue({
      payload: {
        keys: []
      }
    })

    jwkToPem.mockImplementation((key) => {
      if (key === undefined) {
        throw new TypeError('Cannot convert undefined JWK to PEM')
      }
      return mockPem
    })

    await expect(verifyToken(mockToken)).rejects.toThrow(TypeError)
  })
})

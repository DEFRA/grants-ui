import { generateKeyPairSync } from 'node:crypto'
import Jwt from '@hapi/jwt'
import Wreck from '@hapi/wreck'
import { getOidcConfig } from './get-oidc-config.js'
import { jwksCachePlugin, verifyToken } from './verify-token.js'
import { useCachedMethodServer } from '~/src/server/common/helpers/cache/cached-method.test-helpers.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'

vi.unmock('@hapi/jwt')
vi.mock('./get-oidc-config.js')

const kid = 'stub-signing-key'
const oldKeys = generateKeyPairSync('rsa', { modulusLength: 2048 })
const newKeys = generateKeyPairSync('rsa', { modulusLength: 2048 })
const jwks = (keys) => ({ payload: { keys: [{ ...keys.publicKey.export({ format: 'jwk' }), kid }] } })
const token = (keys, payload = {}) =>
  Jwt.token.generate(payload, { key: keys.privateKey, algorithm: 'RS256' }, { header: { kid }, ttlSec: 60 })

useCachedMethodServer(jwksCachePlugin)
beforeEach(() => {
  vi.clearAllMocks()
  getOidcConfig.mockResolvedValue({ jwks_uri: 'https://identity.example/jwks' })
})

it('refreshes a cached signing key when the provider reuses its key ID after rotation', async () => {
  Wreck.get.mockResolvedValueOnce(jwks(oldKeys)).mockResolvedValue(jwks(newKeys))
  await verifyToken(token(oldKeys))

  await verifyToken(token(newKeys))
  await verifyToken(token(newKeys))

  expect(Wreck.get).toHaveBeenCalledTimes(2)
})

it.each([kid, 'unrelated-key'])(
  'rejects a forged token after at most one refresh (initial key ID: %s)',
  async (initialKid) => {
    Wreck.get
      .mockResolvedValueOnce({
        payload: { keys: [{ ...oldKeys.publicKey.export({ format: 'jwk' }), kid: initialKid }] }
      })
      .mockResolvedValue(jwks(oldKeys))

    await expect(verifyToken(token(newKeys))).rejects.toThrow('Invalid token signature')

    expect(Wreck.get).toHaveBeenCalledTimes(2)
    expect(log).toHaveBeenCalledExactlyOnceWith(
      LogCodes.AUTH.TOKEN_VERIFICATION_FAILURE,
      expect.objectContaining({ errorMessage: 'Invalid token signature' })
    )
  }
)

it.each([
  [{ exp: 1 }, 'Token expired'],
  [{ nbf: 4102444800 }, 'Token not yet active']
])('still checks token validity after refreshing the signing key: %j', async (payload, message) => {
  Wreck.get.mockResolvedValueOnce(jwks(oldKeys)).mockResolvedValue(jwks(newKeys))
  await verifyToken(token(oldKeys))

  await expect(verifyToken(token(newKeys, payload))).rejects.toThrow(message)

  expect(Wreck.get).toHaveBeenCalledTimes(2)
})

it.each([
  [() => token(oldKeys, { exp: 1 }), 'Token expired'],
  [
    () => Jwt.token.generate({}, { key: Buffer.alloc(32), algorithm: 'HS256' }, { header: { kid } }),
    'Unsupported algorithm'
  ]
])('does not refresh for non-signature verification errors', async (makeToken, message) => {
  Wreck.get.mockResolvedValue(jwks(oldKeys))

  await expect(verifyToken(makeToken())).rejects.toThrow(message)

  expect(Wreck.get).toHaveBeenCalledTimes(1)
})

it('fails closed when refresh fails and allows a subsequent fresh-key verification', async () => {
  const error = new Error('JWKS unavailable')
  Wreck.get.mockResolvedValueOnce(jwks(oldKeys)).mockRejectedValueOnce(error).mockResolvedValue(jwks(newKeys))
  await verifyToken(token(oldKeys))

  await expect(verifyToken(token(newKeys))).rejects.toBe(error)
  await verifyToken(token(newKeys))

  expect(Wreck.get).toHaveBeenCalledTimes(3)
})

import convict from 'convict'

const config = convict({
  wellKnownUrl: {
    doc: 'The Defra Identity well known URL.',
    format: String,
    default: 'https://default-url.com',
    env: 'DEFRA_ID_WELL_KNOWN_URL'
  },
  clientId: {
    doc: 'The Defra Identity client ID.',
    format: String,
    default: 'default-client-id',
    env: 'DEFRA_ID_CLIENT_ID'
  },
  clientSecret: {
    doc: 'The Defra Identity client secret.',
    format: String,
    default: 'default-client-secret',
    env: 'DEFRA_ID_CLIENT_SECRET'
  },
  serviceId: {
    doc: 'The Defra Identity service ID.',
    format: String,
    default: 'default-service-id',
    env: 'DEFRA_ID_SERVICE_ID'
  },
  policy: {
    doc: 'The Defra Identity policy.',
    format: String,
    default: 'signupsigninsfi',
    env: 'DEFRA_ID_POLICY'
  },
  redirectUrl: {
    doc: 'The Defra Identity redirect URL.',
    format: String,
    default: 'https://default-redirect-url.com',
    env: 'DEFRA_ID_REDIRECT_URL'
  },
  signOutRedirectUrl: {
    doc: 'The Defra Identity sign out redirect URL.',
    format: String,
    default: 'https://default-sign-out-url.com',
    env: 'DEFRA_ID_SIGN_OUT_REDIRECT_URL'
  },
  refreshTokens: {
    doc: 'True if Defra Identity refresh tokens are enabled.',
    format: Boolean,
    default: true,
    env: 'DEFRA_ID_REFRESH_TOKENS'
  }
})

config.validate({ allowed: 'strict' })

export default config

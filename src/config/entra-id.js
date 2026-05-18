import convict from 'convict'

const config = convict({
  wellKnownUrl: {
    doc: 'The Microsoft Entra ID well known URL.',
    format: String,
    default: 'https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration',
    env: 'ENTRA_ID_CONFIG_URL'
  },
  clientId: {
    doc: 'The Microsoft Entra ID client ID.',
    format: String,
    default: 'default-client-id',
    env: 'ENTRA_ID_CLIENT_ID'
  },
  clientSecret: {
    doc: 'The Microsoft Entra ID client secret.',
    format: String,
    default: 'default-client-secret',
    env: 'ENTRA_ID_CLIENT_SECRET'
  },
  tenantId: {
    doc: 'The Microsoft Entra ID tenant ID.',
    format: String,
    default: 'common',
    env: 'ENTRA_ID_TENANT_ID'
  },
  redirectUrl: {
    doc: 'The Microsoft Entra ID redirect URL.',
    format: String,
    default: 'https://default-redirect-url.com',
    env: 'ENTRA_ID_REDIRECT_URL'
  }
})

config.validate({ allowed: 'strict' })

export default config

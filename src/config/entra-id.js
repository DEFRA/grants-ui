import convict from 'convict'

const isProduction = process.env.NODE_ENV === 'production'

const oneHourMs = 3600000
const fourHoursMs = oneHourMs * 4

const config = convict({
  tenantId: {
    doc: 'The Microsoft Entra ID tenant ID. Used to derive discoveryUri when that is not explicitly overridden.',
    format: String,
    default: 'common',
    env: 'ENTRA_FEDERATED_TENANT_ID'
  },
  discoveryUri: {
    doc: 'The Microsoft Entra ID OIDC discovery (well-known configuration) URL. Overrides the URL derived from tenantId when set.',
    format: String,
    default: 'https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration',
    env: 'ENTRA_FEDERATED_DISCOVERY_URI'
  },
  clientId: {
    doc: 'The Microsoft Entra ID client ID.',
    format: String,
    default: 'default-client-id',
    env: 'ENTRA_FEDERATED_CLIENT_ID'
  },
  scope: {
    doc: 'Space-separated OIDC/Graph scopes requested at sign-in.',
    format: String,
    default: 'openid profile email offline_access user.read',
    env: 'ENTRA_FEDERATED_SCOPE'
  },
  loginCallbackUri: {
    doc: 'Relative path Azure redirects back to after sign-in. Must match a redirect URI registered on the app registration.',
    format: String,
    default: '/login/callback',
    env: 'ENTRA_FEDERATED_LOGIN_CALLBACK_URI'
  },
  useHttp: {
    doc: 'Allow insecure HTTP for OIDC discovery. Only for local/non-production use.',
    format: Boolean,
    default: false,
    env: 'ENTRA_FEDERATED_USE_HTTP'
  },
  federatedCredentials: {
    enableMocking: {
      doc: 'Use MockProvider instead of WebIdentityTokenProvider. Only for local/non-production use.',
      format: Boolean,
      default: false,
      env: 'ENTRA_FEDERATED_ENABLE_MOCKING'
    },
    audience: {
      doc: 'Audience configured on the Entra ID federated credential for this AWS web identity.',
      format: String,
      default: 'grants-ui',
      env: 'ENTRA_FEDERATED_AUDIENCE'
    },
    earlyRefreshMs: {
      doc: 'Milliseconds before actual expiry to refresh the federated AWS token early.',
      format: Number,
      default: 0,
      env: 'ENTRA_FEDERATED_EARLY_REFRESH_MS'
    }
  },
  cookie: {
    password: {
      doc: 'Password used to Iron-encrypt the entra-id OIDC state cookie and session cookie. 32+ chars.',
      format: String,
      default: 'entra-id-oidc-cookie-password-change-me-1234567',
      env: 'ENTRA_FEDERATED_COOKIE_PASSWORD',
      sensitive: true
    },
    isSecure: {
      doc: 'Send the entra-id cookies over HTTPS only.',
      format: Boolean,
      default: isProduction,
      env: 'ENTRA_FEDERATED_COOKIE_SECURE'
    },
    isSameSite: {
      doc: 'SameSite policy for the entra-id session cookie.',
      format: ['Strict', 'Lax', 'None'],
      default: 'Lax',
      env: 'ENTRA_FEDERATED_COOKIE_SAME_SITE'
    }
  },
  session: {
    ttl: {
      doc:
        'Lifetime of a signed-in Entra ID session. Drives both the entraIdSessionId cookie ttl and ' +
        'the expiry of its backing cache entry, so the two cannot drift apart. Must be >= 1: ' +
        '@hapi/cookie forbids `keepAlive` when cookie.ttl is 0.',
      format: (val) => {
        if (!Number.isInteger(val) || val < 1) {
          throw new Error('must be an integer >= 1')
        }
      },
      default: fourHoursMs,
      env: 'ENTRA_FEDERATED_SESSION_TTL'
    }
  }
})

config.validate({ allowed: 'strict' })

export default config

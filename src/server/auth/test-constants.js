export const TEST_CONSTANTS = {
  CRN: {
    VALID: '1101009926',
    VALID_ALT: '1101010029',
    INVALID: '9999999999',
    WHITELISTED: ['1101009926', '1101010029', '1101014318', '1101016409', '1101019239']
  },
  SBI: {
    VALID: '106953974',
    VALID_ALT: '115766011',
    INVALID: '999999999',
    WHITELISTED: ['106953974', '115766011', '106380686', '110191709', '115816271']
  },
  ENV_VARS: {
    CRN_WHITELIST: 'EXAMPLE_WHITELIST_CRNS',
    SBI_WHITELIST: 'EXAMPLE_WHITELIST_SBIS'
  },
  PATHS: {
    START: '/example-grant/start',
    AUTH_SIGN_IN: '/auth/sign-in',
    AUTH_SIGN_OUT: '/auth/sign-out',
    JOURNEY_UNAUTHORISED: '/auth/journey-unauthorised',
    FORM_PATH: '/example-grant/question-1',
    FORM_PATH_WITH_QUERY: '/example-grant/question-1?param=value'
  },
  REQUEST_PROPERTIES: {
    AUTHENTICATED: {
      auth: {
        isAuthenticated: true,
        strategy: 'oidc',
        mode: 'required',
        credentials: {
          crn: '1101009926',
          contactId: '1101009926'
        }
      }
    },
    UNAUTHENTICATED: {
      auth: {
        isAuthenticated: false,
        strategy: null,
        mode: 'required'
      }
    }
  },
  FORM_DEFINITIONS: {
    WITH_WHITELIST: {
      metadata: {
        whitelistCrnEnvVar: 'EXAMPLE_WHITELIST_CRNS',
        whitelistSbiEnvVar: 'EXAMPLE_WHITELIST_SBIS'
      }
    },
    WITH_CRN_ONLY: {
      metadata: {
        whitelistCrnEnvVar: 'EXAMPLE_WHITELIST_CRNS'
      }
    },
    WITH_SBI_ONLY: {
      metadata: {
        whitelistSbiEnvVar: 'EXAMPLE_WHITELIST_SBIS'
      }
    },
    WITHOUT_WHITELIST: {
      metadata: {}
    }
  }
}

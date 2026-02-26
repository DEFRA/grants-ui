import {
  CognitoIdentityClient,
  GetOpenIdTokenForDeveloperIdentityCommand
} from '@aws-sdk/client-cognito-identity'

import { config } from '~/src/config/config.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'

const client = new CognitoIdentityClient()

/**
 * Gets a short-lived OpenID token from AWS Cognito for federated credential authentication.
 * @async
 * @returns {Promise<string>} The Cognito OpenID token
 * @throws {Error} If the Cognito API call fails or returns no token
 */
export async function getCognitoToken() {
  const identityPoolId = config.get('cognito.identityPoolId')
  const loginKey = config.get('cognito.loginKey')
  const loginValue = config.get('cognito.loginValue')

  try {
    const command = new GetOpenIdTokenForDeveloperIdentityCommand({
      IdentityPoolId: identityPoolId,
      Logins: {
        [loginKey]: loginValue
      }
    })

    const result = await client.send(command)

    if (!result.Token) {
      throw new Error('Cognito response did not contain a token')
    }

    return result.Token
  } catch (error) {
    log(LogCodes.SYSTEM.EXTERNAL_API_ERROR, {
      endpoint: 'Cognito GetOpenIdTokenForDeveloperIdentity',
      errorMessage: error.message
    })
    throw error
  }
}

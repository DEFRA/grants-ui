import { GetWebIdentityTokenCommand } from '@aws-sdk/client-sts'
import { config } from '~/src/config/config.js'

const serviceAuthAudience = config.get('scoring.serviceAuth.audience')
const serviceAuthTokenDuration = config.get('scoring.serviceAuth.tokenDuration')

/**
 * Generates a token for the scoring service
 * @param {import('@aws-sdk/client-sts').STSClient} stsClient
 * @returns WebIdentityToken
 */
export const generateToken = async (stsClient) => {
  const input = {
    SigningAlgorithm: 'RS256',
    Audience: [serviceAuthAudience],
    DurationSeconds: serviceAuthTokenDuration
  }
  const command = new GetWebIdentityTokenCommand(input)

  const { WebIdentityToken } = await stsClient.send(command)
  return WebIdentityToken
}

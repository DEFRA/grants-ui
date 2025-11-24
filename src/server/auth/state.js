import crypto from 'node:crypto'
import { log } from '~/src/server/common/helpers/logging/log.js'
import { LogCodes } from '~/src/server/common/helpers/logging/log-codes.js'

function createState(request) {
  // Generate a unique state value and store it in the session
  // Defra Identity will pass this value back to the application during redirection
  // The value should be verified when the user is redirected back to the application to prevent CSRF attacks
  // The format must be base64 encoded
  const state = Buffer.from(JSON.stringify({ id: crypto.randomUUID() })).toString('base64')
  request.yar.set('state', state)
  return state
}

function validateState(request, state) {
  const storedState = request.yar.get('state')

  request.yar.clear('state')

  // If state has been modified, it is likely a potential CSRF attack
  if (storedState !== state) {
    log(
      LogCodes.AUTH.INVALID_STATE,
      {
        reason: 'State mismatch during OAuth callback',
        storedStatePresent: Boolean(storedState),
        path: request.path,
        ip: request.info.remoteAddress
      },
      request
    )
    throw new Error('Invalid state, possible CSRF attack')
  }
}

export { createState, validateState }

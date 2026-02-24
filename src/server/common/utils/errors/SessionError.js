import { BaseError } from '~/src/server/common/utils/errors/BaseError.js'
import { LogCodes } from '~/src/server/common/helpers/logging/log-codes.js'

export class SessionError extends BaseError {
  logCode = LogCodes.SYSTEM.SERVER_ERROR
}

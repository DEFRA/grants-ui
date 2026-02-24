import { BaseError } from '~/src/server/common/utils/errors/BaseError.js'
import { LogCodes } from '~/src/server/common/helpers/logging/log-codes.js'

export class GrantApplicationServiceError extends BaseError {
  logCode = LogCodes.SYSTEM.EXTERNAL_API_ERROR
}

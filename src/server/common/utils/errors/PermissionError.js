import { BaseError } from '~/src/server/common/utils/errors/BaseError.js'
import { LogCodes } from '~/src/server/common/helpers/logging/log-codes.js'

export class PermissionError extends BaseError {
  logCode = LogCodes.PERMISSIONS.ACCESS_DENIED
}

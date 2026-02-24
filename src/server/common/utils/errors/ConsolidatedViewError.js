import { BaseError } from '~/src/server/common/utils/errors/BaseError.js'
import { LogCodes } from '~/src/server/common/helpers/logging/log-codes.js'

export class ConsolidatedViewError extends BaseError {
  logCode = LogCodes.SYSTEM.CONSOLIDATED_VIEW_API_ERROR
}

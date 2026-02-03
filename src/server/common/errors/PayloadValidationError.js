import { AppError } from './AppError.js'

export class PayloadValidationError extends AppError {
  constructor(message, context = {}) {
    super(message, {
      code: 'PAYLOAD_VALIDATION_ERROR',
      context
    })
  }
}

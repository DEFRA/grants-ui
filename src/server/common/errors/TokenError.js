import { AppError } from './AppError.js'

export class TokenError extends AppError {
  constructor(message, context = {}) {
    super(message, {
      code: 'TOKEN_ERROR',
      context
    })
  }
}

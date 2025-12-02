import { AppError } from './AppError.js'

export class AuthError extends AppError {
  constructor(message, context = {}) {
    super(message, {
      code: 'AUTH_ERROR',
      context
    })
  }
}

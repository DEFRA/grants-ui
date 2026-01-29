import { AppError } from './AppError.js'

export class OidcConfigError extends AppError {
  constructor(message, context = {}) {
    super(message, {
      code: 'OIDC_CONFIG_ERROR',
      context,
      alreadyLogged: true
    })
  }
}

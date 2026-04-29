import { AUTH } from './auth.js'
import { FORMS } from './forms.js'
import { SUBMISSION } from './submission.js'
import { DECLARATION } from './declaration.js'
import { CONFIRMATION } from './confirmation.js'
import { LAND_GRANTS } from './land-grants.js'
import { WOODLAND } from './woodland.js'
import { AGREEMENTS } from './agreements.js'
import { COOKIES } from './cookies.js'
import { RESOURCE_NOT_FOUND } from './resource-not-found.js'
import { APPLICATION_LOCKS } from './application-locks.js'
import { PRINT_APPLICATION } from './print-application.js'
import { SYSTEM } from './system.js'

/**
 * @namespace LogTypes
 * @typedef {"info"|"warn"|"error"|"debug"} LogTypes.LogLevel
 *
 * @typedef {Object} LogCodesDefinition
 * @property {LogTypes.LogLevel} level - The log level (e.g., 'info', 'warn', 'error', 'debug').
 * @property {(messageOptions: Record<string, any>) => string} messageFunc - A function that takes message options. Each log code reads its own per-call fields, so the bag is intentionally loose; tightening to `unknown` breaks legitimate per-code field access (e.g. `.missingFields.join()`, `new URL(...)`).
 */

/**
 * @type {Record<string, Record<string, LogCodesDefinition>>}
 */
export const LogCodes = {
  AUTH,
  FORMS,
  SUBMISSION,
  DECLARATION,
  CONFIRMATION,
  LAND_GRANTS,
  WOODLAND,
  AGREEMENTS,
  COOKIES,
  RESOURCE_NOT_FOUND,
  APPLICATION_LOCKS,
  PRINT_APPLICATION,
  SYSTEM
}

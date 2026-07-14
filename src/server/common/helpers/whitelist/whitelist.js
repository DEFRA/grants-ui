import { config } from '~/src/config/config.js'
import { WhitelistServiceFactory } from '~/src/server/auth/services/whitelist.service.js'
import { getStateWithDefinition } from '~/src/server/common/helpers/state/state-with-definition-context.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'

export default {
  plugin: {
    name: 'whitelist',
    register: (/** @type {Server} */ server) => {
      server.ext('onPostAuth', (request, h) => whitelistHandler(request, h))
    }
  }
}

/**
 * Resolves the grant's form definition from the per-request combined backend
 * envelope — the same memoised fetch the forms engine later uses to load the
 * definition — so whitelist enforcement always sees the metadata of the
 * definition being served, even on a fresh Redis or the first request after a
 * new publish.
 *
 * Unknown slugs resolve to `undefined` (open access, followed by the engine's
 * own 404). Backend failures also resolve to `undefined`: the form route then
 * fails anyway when the engine awaits the same memoised envelope, so no
 * protected content can be served through this fallback.
 *
 * @param {Request} request
 * @returns {Promise<{ name?: string, metadata?: Record<string, unknown> } | undefined>}
 */
async function resolveGrantDefinition(request) {
  /** @type {Error | undefined} */
  let resolveError

  try {
    const body = await getStateWithDefinition(request)
    return body?.definition?.definition
  } catch (err) {
    resolveError = /** @type {Error} */ (err)
  }

  log(
    LogCodes.SYSTEM.SERVER_ERROR,
    {
      errorMessage: `whitelist: failed to resolve definition metadata for '${request.params.slug}': ${resolveError.message}`
    },
    request
  )
  return undefined
}

/**
 * Guards against misconfigured whitelists, replacing the startup validation
 * that ran when forms were registered from local YAML (there is no startup
 * pass over forms any more). A form that declares whitelist env vars which
 * are incomplete or unset in the environment must fail closed — throwing here
 * gives every request to that grant a 500, the request-scoped equivalent of
 * the boot failure the old validation produced.
 *
 * @param {{ whitelistCrnEnvVar?: string, whitelistSbiEnvVar?: string } | undefined} grantMetadata
 * @param {string} formName
 * @returns {void}
 */
function validateWhitelistEnvConfig(grantMetadata, formName) {
  const whitelistCrnEnvVar = grantMetadata?.whitelistCrnEnvVar
  const whitelistSbiEnvVar = grantMetadata?.whitelistSbiEnvVar

  if (Boolean(whitelistCrnEnvVar) !== Boolean(whitelistSbiEnvVar)) {
    const missingVar = whitelistCrnEnvVar ? 'whitelistSbiEnvVar' : 'whitelistCrnEnvVar'
    const presentVar = whitelistCrnEnvVar ? 'whitelistCrnEnvVar' : 'whitelistSbiEnvVar'

    log(LogCodes.SYSTEM.WHITELIST_CONFIG_INCOMPLETE, { formName, missingVar, presentVar })

    throw new Error(
      `Incomplete whitelist configuration in form ${formName}: ${presentVar} is defined but ${missingVar} is missing. Both CRN and SBI whitelist variables must be configured together.`
    )
  }

  if (whitelistCrnEnvVar && !process.env[whitelistCrnEnvVar]) {
    log(LogCodes.SYSTEM.CRN_ENV_VAR_MISSING, { envVar: whitelistCrnEnvVar, formName })
    throw new Error(
      `CRN whitelist environment variable ${whitelistCrnEnvVar} is defined in form ${formName} but not configured in environment`
    )
  }

  if (whitelistSbiEnvVar && !process.env[whitelistSbiEnvVar]) {
    log(LogCodes.SYSTEM.SBI_ENV_VAR_MISSING, { envVar: whitelistSbiEnvVar, formName })
    throw new Error(
      `SBI whitelist environment variable ${whitelistSbiEnvVar} is defined in form ${formName} but not configured in environment`
    )
  }
}

/**
 * Hapi `onPostAuth` extension that enforces grant whitelist access.
 *
 * @param {Request} request - The incoming request.
 * @param {ResponseToolkit} h - The Hapi response toolkit.
 * @returns {Promise<symbol | ResponseObject>} The continue signal or a redirect response.
 */
const whitelistHandler = async (request, h) => {
  if (!request.auth.isAuthenticated) {
    return h.continue
  }

  const slug = /** @type {string | undefined} */ (request.params.slug)
  if (!slug) {
    // No form in play: nothing to whitelist. Matches the previous logic,
    // where no form matched the (absent) slug and the empty whitelists
    // allowed the request through.
    return h.continue
  }

  const crn = /** @type {string} */ (request.auth.credentials.crn)
  const sbi = /** @type {string} */ (request.auth.credentials.sbi)

  const enabledCodes = /** @type {string[]} */ (config.get('forms.backendAllowlistEnabledSlugs'))

  if (enabledCodes.includes(slug)) {
    return h.continue
  }

  const definition = await resolveGrantDefinition(request)
  const grantMetadata = /** @type {{ whitelistCrnEnvVar?: string, whitelistSbiEnvVar?: string } | undefined} */ (
    definition?.metadata
  )

  validateWhitelistEnvConfig(grantMetadata, definition?.name ?? slug)

  const whitelistService = WhitelistServiceFactory.getService(grantMetadata)
  const validation = whitelistService.validateGrantAccess(crn, sbi)

  whitelistService.logWhitelistValidation({
    crn,
    sbi,
    path: request.path,
    crnPassesValidation: validation.crnPassesValidation,
    sbiPassesValidation: validation.sbiPassesValidation,
    hasCrnValidation: validation.hasCrnValidation,
    hasSbiValidation: validation.hasSbiValidation
  })

  if (!validation.overallAccess) {
    await request.sendAuditEvent({
      action: 'unauthorised',
      status: 'denied',
      details: {
        reason: 'allowlist',
        crnPassesValidation: validation.crnPassesValidation,
        sbiPassesValidation: validation.sbiPassesValidation
      }
    })
    return h.redirect(`/auth/journey-unauthorised`).takeover()
  }
  return h.continue
}

/**
 * @import { Request, ResponseObject, ResponseToolkit, Server } from '@hapi/hapi'
 */

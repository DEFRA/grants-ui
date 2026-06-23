import { getCacheKey } from '~/src/server/common/helpers/state/get-cache-key-helper.js'
import { clearSavedStateFromApi } from '../../helpers/state/fetch-saved-state-helper.js'
import { getStateWithDefinition, resolveVersion } from '../../helpers/state/state-with-definition-context.js'
import { persistStateToApi } from '../../helpers/state/persist-state-helper.js'
import { ADDITIONAL_IDENTIFIER, CacheService } from '@defra/forms-engine-plugin/cache-service.js'
import { debug, LogCodes } from '../../helpers/logging/log.js'
import { mintLockToken } from '../../helpers/lock/lock-token.js'

/**
 * Service responsible for persisting form/session state to the backend API.
 * Can be used in place of a traditional Hapi cache in Forms Engine Plugin.
 */
export class StatePersistenceService extends CacheService {
  /**
   * @param {object} options
   * @param {Server} options.server - Hapi server (used for logging)
   */
  constructor({ server }) {
    super({ server })
    this.logger = server.logger
  }

  UNKNOWN_SESSION = 'unknown session'

  /**
   * Get form state from backend persistence.
   *
   * Reads the combined `{ definition, state, upgraded, ... }` envelope from the
   * per-request stash (priming it via the single-flight accessor if absent), so
   * the form-definition path and this read share a single backend call. The
   * backend resolves the active grant version, which is recorded on
   * `request.app.grantVersion` for downstream save/clear flows.
   *
   * @param {AnyRequest} request
   * @returns {Promise<object>} resolved state or empty object
   */
  async getState(request) {
    const key = (() => {
      try {
        return this._Key(request)
      } catch (err) {
        debug(
          LogCodes.SYSTEM.SESSION_STATE_KEY_PARSE_FAILED,
          {
            errorMessage: /** @type {Error} */ (err).message,
            stack: /** @type {Error} */ (err).stack,
            requestPath: request.path
          },
          request
        )

        throw err // rethrow — controller will fail cleanly
      }
    })()
    try {
      const body = await getStateWithDefinition(request)
      const app = /** @type {{ grantVersion?: unknown }} */ (request.app)
      app.grantVersion = resolveVersion(body)
      return /** @type {Record<string, unknown>} */ (body?.state?.state) ?? {}
    } catch (err) {
      debug(
        LogCodes.SYSTEM.SESSION_STATE_FETCH_FAILED,
        {
          sessionKey: key,
          errorMessage: /** @type {Error} */ (err).message,
          requestPath: request.path
        },
        request
      )

      throw err
    }
  }

  /**
   * Persist form state to backend.
   *
   * The state MUST be saved under the same grant version the backend resolved
   * for the read (`getState` records it on `request.app.grantVersion`). After a
   * backend version migration (e.g. 1.0.0 → 1.0.1) the form definition's
   * authored `metadata.version` can lag behind the active version, so writing
   * under it would persist to the *old* version document and the migrated read
   * would return the answer blanked. Prefer the resolved active version.
   *
   * @param {AnyFormRequest} request
   * @param {FormSubmissionState} state
   * @returns {Promise<FormSubmissionState>} the persisted state
   */
  async setState(request, state) {
    const key = this._Key(request)
    const grantVersion = await this._resolveActiveGrantVersion(request)
    const lockToken = this._buildLockToken(request, grantVersion)
    await persistStateToApi(state, key, { lockToken, grantVersion })
    return state
  }

  /**
   * Resolves the grant version state should be persisted under, matching the
   * version the backend resolved for the read:
   * 1. `request.app.grantVersion` recorded by {@link getState}
   * 2. otherwise re-resolved from the combined envelope
   * 3. otherwise the form definition's authored version (defaulting to 1 to
   *    support non-config broker grants)
   *
   * @param {AnyRequest} request
   * @returns {Promise<string | number>}
   */
  async _resolveActiveGrantVersion(request) {
    const fromContext = /** @type {{ grantVersion?: string | number }} */ (request.app).grantVersion
    if (fromContext) {
      return fromContext
    }

    const resolved = resolveVersion(await getStateWithDefinition(request))
    return resolved ?? /** @type {string | number} */ (request.app.model?.def?.metadata?.version) ?? 1
  }

  /**
   * Retrieves the confirmation state for a given request.
   * This typically tracks whether the user has confirmed submission or similar actions.
   * The state is persisted via the backend API rather than in-memory cache.
   *
   * @param {Request} request
   * @returns {Promise<{ confirmed?: true }>} Confirmation state
   */
  async getConfirmationState(request) {
    // NO-OP because you want to keep state even after submission
    const key = this._ConfirmationKey(request)
    this.logger?.debug(`getConfirmationState called for ${key || this.UNKNOWN_SESSION}, but no action taken.`)
    return {}
  }

  /**
   * Persists the confirmation state for a given request.
   * This allows tracking of actions such as submission confirmation across sessions.
   * The state is saved to the backend API rather than in-memory cache.
   *
   * @param {Request} request
   * @param {{ confirmed?: true }} _confirmationState
   */
  async setConfirmationState(request, _confirmationState) {
    // NO-OP because you want to keep state even after submission
    const key = this._ConfirmationKey(request)
    this.logger?.debug(`setConfirmationState called for ${key || this.UNKNOWN_SESSION}, but no action taken.`)
  }

  /**
   * Clear state in backend (no-op if you don’t want to clear on submission).
   * @param {AnyRequest} request
   * @param force
   */
  async clearState(request, force = false) {
    // NO-OP because you want to keep state even after submission
    const key = this._Key(request)
    this.logger?.debug(`clearState called for ${key || this.UNKNOWN_SESSION}, but no action taken.`)

    if (force) {
      // State is persisted under the backend-resolved active version (see
      // setState), which for config-broker grants is a semver (e.g. 1.0.1) that
      // can differ from the form definition's authored metadata version. Resolve
      // the same active version here so the DELETE targets the correct version
      // document and the lock token matches; otherwise the backend 404s, the
      // clear is silently treated as "no state found", and nothing is removed.
      const grantVersion = await this._resolveActiveGrantVersion(request)
      const lockToken = this._buildLockToken(request, grantVersion)
      await clearSavedStateFromApi(key, request, { lockToken, grantVersion })
    }
  }

  /**
   * Generate a unique key for this request.
   * @param {AnyRequest} request
   * @returns string
   */
  _Key(request) {
    const { sbi, grantCode } = getCacheKey(request)
    return `${sbi}:${grantCode}`
  }

  /**
   * Generate a unique confirmation key for this request.
   * @param {AnyRequest} request
   * @returns string
   */
  _ConfirmationKey(request) {
    const key = this._Key(request)
    return `${key}${ADDITIONAL_IDENTIFIER.Confirmation}`
  }

  /**
   * Builds an application lock token for the current request.
   *
   * The lock token is used by the backend API to enforce exclusive
   * access to application state (read/write/clear operations).
   *
   * The token scopes the lock to:
   * - the authenticated user
   * - the SBI (organisation)
   * - the grant (code + version)
   *
   * @param {AnyRequest} request
   * @param {string | number} [grantVersion] - The grant version to scope the
   * lock to. Defaults to the form definition's authored version (1 for
   * non-config broker grants). Callers that have resolved the active backend
   * version (e.g. {@link setState}) should pass it so the lock matches the
   * version the state is written under.
   * @returns {string} A signed JWT lock token
   */
  _buildLockToken(
    request,
    grantVersion = /** @type {string | number} */ (request.app.model?.def?.metadata?.version) ?? 1
  ) {
    const { sbi, grantCode } = getCacheKey(request)
    const contactId = request.auth?.credentials?.contactId

    if (!contactId) {
      throw new Error('Missing user identity for lock token')
    }

    return mintLockToken({
      userId: String(contactId),
      sbi,
      grantCode,
      grantVersion: /** @type {string | number} */ (grantVersion)
    })
  }
}

/**
 * @import { AnyRequest, AnyFormRequest, FormSubmissionState } from '@defra/forms-engine-plugin/engine/types.js'
 * @import { Request, Server } from '@hapi/hapi'
 */

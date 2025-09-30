import { getCacheKey } from '~/src/server/common/helpers/state/get-cache-key-helper.js'
import { fetchSavedStateFromApi } from '../../helpers/state/fetch-saved-state-helper.js'
import { persistStateToApi } from '../../helpers/state/persist-state-helper.js'
import { ADDITIONAL_IDENTIFIER, CacheService } from '@defra/forms-engine-plugin/cache-service.js'

/**
 * Service responsible for persisting form/session state to the backend API.
 * Can be used in place of a traditional Hapi cache in Forms Engine Plugin.
 */
export class StatePersistenceService extends CacheService {
  /**
   * @param {import('@hapi/hapi').Server} options.server - Hapi server (used for logging)
   */
  constructor({ server }) {
    super({ server })
    this.logger = server.logger
  }

  /**
   * Get form state from backend persistence.
   * @param {import('../plugins/engine/types.js').AnyRequest} request
   * @returns {Promise<object>} resolved state or empty object
   */
  async getState(request) {
    const key = this._Key(request)
    const state = await fetchSavedStateFromApi(key)
    return state ?? {}
  }

  /**
   * Persist form state to backend.
   * @param {import('../plugins/engine/types.js').AnyFormRequest} request
   * @param {object} state
   * @returns {Promise<object>} the persisted state
   */
  async setState(request, state) {
    const key = this._Key(request)
    await persistStateToApi(state, key)
    return state
  }

  /**
   * Retrieves the confirmation state for a given request.
   * This typically tracks whether the user has confirmed submission or similar actions.
   * The state is persisted via the backend API rather than in-memory cache.
   *
   * @param {import('@hapi/hapi').Request} request
   * @returns {Promise<{ confirmed?: true }>} Confirmation state
   */
  async getConfirmationState(request) {
    // NO-OP because you want to keep state even after submission
    const key = this._ConfirmationKey(request)
    this.logger?.info(`getConfirmationState called for ${key || 'unknown session'}, but no action taken.`)
  }

  /**
   * Persists the confirmation state for a given request.
   * This allows tracking of actions such as submission confirmation across sessions.
   * The state is saved to the backend API rather than in-memory cache.
   *
   * @param {import('@hapi/hapi').Request} request
   * @param {{ confirmed?: true }} confirmationState
   */
  async setConfirmationState(request, confirmationState) {
    // NO-OP because you want to keep state even after submission
    const key = this._ConfirmationKey(request)
    this.logger?.info(`setConfirmationState called for ${key || 'unknown session'}, but no action taken.`)
  }

  /**
   * Clear state in backend (no-op if you don’t want to clear on submission).
   * @param {import('../plugins/engine/types.js').AnyFormRequest} request
   */
  async clearState(request) {
    // NO-OP because you want to keep state even after submission
    const key = this._Key(request)
    this.logger?.info(`clearState called for ${key || 'unknown session'}, but no action taken.`)
  }

  /**
   * Generate a unique key for this request.
   * @param {import('../plugins/engine/types.js').AnyRequest} request
   * @returns string
   */
  _Key(request) {
    const { sbi, grantCode } = getCacheKey(request)
    return `${sbi}:${grantCode}`
  }

  /**
   * Generate a unique confirmation key for this request.
   * @param {import('../plugins/engine/types.js').AnyRequest} request
   * @returns string
   */
  _ConfirmationKey(request) {
    const key = this._Key(request)
    return `${key}${ADDITIONAL_IDENTIFIER.Confirmation}`
  }
}

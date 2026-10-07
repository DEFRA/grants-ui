import { ApplicationStatus } from '../common/constants/application-status.js'
import { log, LogCodes } from '../common/helpers/logging/log.js'
import { getFormsCacheService } from '../common/helpers/forms-cache/forms-cache.js'

/** Save the next destination only after a successful journey POST. @param {any} request @param {any} h */
export async function saveApplicationResumePath(request, h) {
  const definition = request.app.model?.def
  const location = request.response?.headers?.location
  if (
    request.method !== 'post' ||
    request.route?.realm?.plugin !== '@defra/forms-engine-plugin' ||
    definition?.metadata?.allowMultipleApplications !== true ||
    request.params.path === 'applications' ||
    !location ||
    request.response.statusCode < 300 ||
    request.response.statusCode >= 400
  ) {
    return h.continue
  }
  const prefix = `/${request.params.slug}`
  const destination = new URL(location, 'http://localhost').pathname
  if (!destination.startsWith(`${prefix}/`)) {
    return h.continue
  }
  const path = destination.slice(prefix.length)
  if (!definition.pages.some((/** @type {any} */ page) => page.path === path)) {
    return h.continue
  }
  delete request.app.stateWithDefinition
  const cache = getFormsCacheService(request.server)
  try {
    const state = await cache.getState(request)
    if (
      state.applicationStatus &&
      ![ApplicationStatus.CLEARED, ApplicationStatus.REOPENED].includes(state.applicationStatus)
    ) {
      return h.continue
    }
    if (state.lastSavedPath !== path) {
      await cache.setState(request, { ...state, lastSavedPath: path })
    }
  } catch (error) {
    // Resume metadata must not replace an already successful journey response with an error.
    logResumeFailure(request, error)
  }
  return h.continue
}

/** @param {any} request @param {any} error */
function logResumeFailure(request, error) {
  log(
    LogCodes.SYSTEM.APPLICATION_RESUME_SAVE_FAILED,
    { requestPath: request.path, errorMessage: error.message },
    request
  )
}

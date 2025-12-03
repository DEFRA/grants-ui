/**
 * Helper functions for handling form slugs consistently across controllers
 */

import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'

/**
 * Stores the form slug in the context state if it's available in request params
 * @param {object} request - The request object
 * @param {object} context - The context object containing state
 * @param {string} controllerName - The name of the controller for logging
 * @returns {string|null} - The slug that was stored or null if none
 */
export function storeSlugInContext(request, context, controllerName) {
  // Ensure context state exists
  if (!context?.state) {
    return null
  }

  if (request?.params?.slug && !context.state.formSlug) {
    context.state.formSlug = request.params.slug
    log(LogCodes.FORMS.SLUG_STORED, { controller: controllerName, slug: request.params.slug }, request)
    return request.params.slug
  }
  return null
}

/**
 * Gets the form slug using various methods in order of preference
 * @param {object} request - The request object
 * @param {object} context - The context object containing state
 * @param {string} controllerName - The name of the controller for logging
 * @returns {string} - The determined slug or empty string if none found
 */
export function getFormSlug(request, context, controllerName) {
  // First try to get slug from request params (available during initial page render)
  let slug = request?.params?.slug

  // Next try to get it from context state (available during form submission)
  if (!slug && context?.state?.formSlug) {
    slug = context.state.formSlug
    log(
      LogCodes.FORMS.SLUG_RESOLVED,
      { controller: controllerName, message: `Using slug from context.state.formSlug: ${slug}` },
      request
    )
  }

  if (slug) {
    log(LogCodes.FORMS.SLUG_RESOLVED, { controller: controllerName, message: `Using slug: ${slug}` }, request)
    return slug
  }

  log(
    LogCodes.FORMS.SLUG_RESOLVED,
    { controller: controllerName, message: 'No slug found, using default path' },
    request
  )
  return ''
}

/**
 * Gets the path to the confirmation page for the given form
 * @param {object} request - The request object
 * @param {object} context - The context object containing state
 * @param {string} controllerName - The name of the controller for logging
 * @returns {string} - The confirmation page path
 */
export function getConfirmationPath(request, context, controllerName) {
  const slug = getFormSlug(request, context, controllerName)
  return slug ? `/${slug}/confirmation` : '/confirmation'
}

import { config } from '~/src/config/config.js'

/**
 * Query-param names appended to the Qualtrics URL. Kept in one place so a
 * rename (e.g. `journey` → `source`) is a single edit.
 */
export const SURVEY_PARAMS = {
  grant: 'grant',
  journey: 'journey',
  url: 'url'
}

/**
 * Values for the `journey` param.
 */
export const JOURNEY = {
  inProgress: 'application-inprogress',
  submitted: 'application-submitted'
}

/**
 * Path suffixes that represent a submitted application. Everything else within a
 * grant journey is treated as in-progress.
 */
export const SUBMITTED_PATH_SUFFIXES = ['/confirmation', '/print-submitted-application']

/**
 * Resolves the journey state from the request path.
 * @param {string} [path] - The current request path
 * @returns {string} The journey param value
 */
export function resolveJourney(path) {
  const isSubmitted = SUBMITTED_PATH_SUFFIXES.some((suffix) => path?.endsWith(suffix))
  return isSubmitted ? JOURNEY.submitted : JOURNEY.inProgress
}

/**
 * Builds the absolute URL of the current page.
 * @param {import('@hapi/hapi').Request} request - Hapi request object
 * @returns {string} The absolute page URL
 */
function getAbsoluteUrl(request) {
  const href = /** @type {URL | undefined} */ (/** @type {unknown} */ (request.url))?.href
  if (href) {
    return href
  }
  const protocol = request.server?.info?.protocol ?? 'https'
  return `${protocol}://${request.info?.host}${request.path ?? ''}`
}

/**
 * Resolves the grant label from form metadata, falling back to the
 * sentence-cased form definition filename.
 * @param {import('@hapi/hapi').Request} request - Hapi request object
 * @param {string} slug - Form definition filename without the extension
 * @returns {string} The grant label
 */
function resolveGrantLabel(request, slug) {
  const surveyLabel = /** @type {any} */ (request)?.app?.model?.def?.metadata?.surveyLabel
  if (surveyLabel) {
    return surveyLabel
  }

  const filename = slug.replaceAll('-', ' ').toLowerCase()
  return filename.charAt(0).toUpperCase() + filename.slice(1)
}

/**
 * Builds the Qualtrics feedback survey URL for the current request, with the
 * grant / journey / url params appended. Returns null when no form definition
 * filename or survey URL is configured — callers should hide the CTA in that case.
 * @param {import('@hapi/hapi').Request} request - Hapi request object
 * @returns {string | null} The survey URL, or null if the CTA should not render
 */
export function buildFeedbackSurveyUrl(request) {
  const slug = request?.params?.slug
  if (!slug) {
    return null
  }

  const base = config.get('feedback.surveyUrl')
  if (!base) {
    return null
  }

  const grant = resolveGrantLabel(request, slug)

  const params = new URLSearchParams({
    [SURVEY_PARAMS.grant]: grant,
    [SURVEY_PARAMS.journey]: resolveJourney(request.path),
    [SURVEY_PARAMS.url]: getAbsoluteUrl(request)
  })

  const separator = base.includes('?') ? '&' : '?'
  return `${base}${separator}${params.toString()}`
}

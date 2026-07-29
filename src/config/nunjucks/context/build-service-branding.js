const PRIVATE_BETA = 'private-beta'
const PUBLIC_BETA = 'public-beta'
const LIVE = 'live'

/**
 * Grant assessment phases that permit full GOV.UK branding (Crown header,
 * GDS Transport typography, GOV.UK favicon). Until a scheme passes its public
 * GDS assessment it must not appear "fully live", so anything else — including
 * a missing or unrecognised phase — falls back to the restricted layout.
 */
const GOVUK_BRANDED_PHASES = [PUBLIC_BETA, LIVE]

/**
 * Resolves the branding configuration for the current request from the grant
 * definition metadata (`metadata.phase`). Defaults to Private Beta.
 * @param {import('~/src/config/nunjucks/context/context.js').ExtendedRequest} [request]
 * @returns {ServiceBranding}
 */
export function buildServiceBranding(request) {
  const phase = request?.app?.model?.def?.metadata?.phase
  const grantPhase =
    typeof phase === 'string' && [PRIVATE_BETA, ...GOVUK_BRANDED_PHASES].includes(phase) ? phase : PRIVATE_BETA

  return {
    grantPhase,
    govukBranding: GOVUK_BRANDED_PHASES.includes(grantPhase)
  }
}

/**
 * @typedef {object} ServiceBranding
 * @property {string} grantPhase - Resolved grant assessment phase
 * @property {boolean} govukBranding - Whether full GOV.UK branding may be shown
 */

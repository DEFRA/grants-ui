const HTTP_PROTOCOLS = new Set(['http:', 'https:'])

/**
 * The configured Single Front Door URL for the signed-in organisation, or `null` when it is
 * missing or not an http(s) URL.
 * @param {unknown} configuredUrl
 * @param {{ auth: { credentials?: unknown } }} request
 * @returns {string | null}
 */
export function sfdUrlForOrganisation(configuredUrl, request) {
  const trimmedUrl = typeof configuredUrl === 'string' ? configuredUrl.trim() : ''
  if (!URL.canParse(trimmedUrl)) {
    return null
  }

  const url = new URL(trimmedUrl)
  if (!HTTP_PROTOCOLS.has(url.protocol)) {
    return null
  }

  const { currentRelationshipId } = /** @type {{ currentRelationshipId?: string }} */ (request.auth.credentials ?? {})
  if (currentRelationshipId) {
    url.searchParams.set('ssoOrgId', currentRelationshipId)
  }
  return url.toString()
}

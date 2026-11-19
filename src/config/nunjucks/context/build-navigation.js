/**
 * @param {Partial<ExtendedRequest> | null | undefined} request
 * @param {FormMetadata} [metadata]
 */
export function buildNavigation(request, metadata = request?.app?.model?.def?.metadata) {
  const slug = request?.params?.slug
  if (!slug || metadata?.allowMultipleApplications !== true) {
    return []
  }

  const href = `/${slug}/applications`
  return [
    {
      text: 'Manage your applications',
      href,
      current: request.path === href
    }
  ]
}

/**
 * @import { ExtendedRequest, FormMetadata } from './context.js'
 */

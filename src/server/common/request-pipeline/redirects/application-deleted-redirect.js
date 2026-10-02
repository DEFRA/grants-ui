import { ApplicationStatus } from '../../constants/application-status.js'

export function applicationDeletedRedirect(request, h, context) {
  if (context.state?.applicationStatus !== ApplicationStatus.PURGED) {
    return h.continue
  }

  const basePath = request.params.slug ? `/${request.params.slug}` : ''
  const target = `${basePath}/application-deleted`

  if (request.path === target) {
    return h.continue
  }

  // Preserve ?ref= so a multi-application grant's delete/confirm flow stays
  // scoped to the application the user was actually viewing, rather than
  // falling back to an arbitrary application for the SBI once the ref is lost.
  const ref = /** @type {string | undefined} */ (request.query?.ref)
  const targetWithRef = ref ? `${target}?ref=${encodeURIComponent(ref)}` : target

  return h.redirect(targetWithRef).takeover()
}

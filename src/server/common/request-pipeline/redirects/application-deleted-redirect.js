import { ApplicationStatus } from '../../constants/application-status.js'

export function applicationDeletedRedirect(request, h, context) {
  if (context.state?.applicationStatus !== ApplicationStatus.PURGED) {
    return h.continue
  }

  const basePath = request.params.slug ? `/${request.params.slug}` : ''

  if (request.path === `${basePath}/application-deleted`) {
    return h.continue
  }

  return h.redirect(`${basePath}/application-deleted`).takeover()
}

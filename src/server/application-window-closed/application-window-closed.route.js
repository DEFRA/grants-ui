import { YarKeys } from '../common/constants/session-keys.js'

const DEFAULT_SCHEME_NAME = 'this scheme'

/**
 * @satisfies {ServerRoute}
 */
export const applicationWindowClosedGetRoute = {
  method: 'GET',
  path: '/{slug}/application-window-closed',
  handler: (request, h) => {
    const schemeName =
      /** @type {string | undefined} */ (request.yar.get(YarKeys.APPLICATION_WINDOW_CLOSED_SCHEME_NAME)) ??
      DEFAULT_SCHEME_NAME

    request.yar.clear(YarKeys.APPLICATION_WINDOW_CLOSED_SCHEME_NAME)

    return h.view('application-window-closed', {
      pageTitle: 'Application window closed',
      schemeName
    })
  }
}

/**
 * @import { ServerRoute } from '@hapi/hapi'
 */

/**
 * @satisfies {ServerRoute}
 */
export const cannotSubmitRoute = {
  method: 'GET',
  path: '/cannot-submit',
  handler: (request, h) => {
    return h.view('cannot-submit', {
      returnText: request.query.returnText,
      returnUrl: request.query.returnUrl,
      pageTitle: 'You cannot submit this application'
    })
  }
}

/**
 * @import { ServerRoute } from '@hapi/hapi'
 */

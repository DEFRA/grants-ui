/**
 * A GDS styled example home page controller.
 * Provided as an example, remove or modify as required.
 * @satisfies {Partial<ServerRoute>}
 */
export const homeController = {
  handler(_request, h) {
    return h.view('home', {
      pageTitle: 'Home',
      heading: 'Home'
    })
  }
}

export const indexController = {
  handler(_request, h) {
    return h.view('root', {
      pageTitle: 'Index',
      heading: 'Index'
    })
  }
}

/**
 * @import { ServerRoute } from '@hapi/hapi'
 */

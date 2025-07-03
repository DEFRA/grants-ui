/**
 * A GDS styled example home page controller.
 * Provided as an example, remove or modify as required.
 * @satisfies {Partial<ServerRoute>}
 */
export const homeController = {
  handler(_request, h) {
    return h.view('home/views/home', {
      pageTitle: 'Home',
      heading: 'Home'
    })
  }
}

export const indexController = {
  handler(_request, h) {
    return h.view('home/views/index', {
      pageTitle: 'Index',
      heading: 'Index'
    })
  }
}

/**
 * @import { ServerRoute } from '@hapi/hapi'
 */

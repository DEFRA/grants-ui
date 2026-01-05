import { config } from '~/src/config/config.js'
import { renderErrorView } from '~/src/server/common/helpers/errors.js'

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

export const personasController = {
  handler(_request, h) {
    if (config.get('cdpEnvironment') === 'local') {
      return h.view('personas-farm-payments', {
        pageTitle: 'Personas | Farm payments',
        heading: 'Personas - Farm payments'
      })
    } else {
      return renderErrorView(h, 404)
    }
  }
}

/**
 * @import { ServerRoute } from '@hapi/hapi'
 */

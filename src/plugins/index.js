import Bell from '@hapi/bell'
import Cookie from '@hapi/cookie'
import Crumb from '@hapi/crumb'
import Inert from '@hapi/inert'
import Scooter from '@hapi/scooter'
import auth from './auth.js'
import csp from './content-security-policy.js'
import errors from './errors.js'
import headers from './headers.js'
import logging from './logging.js'
import router from './router.js'
import session from './session.js'
import sso from './sso.js'
import views from './views.js'

async function registerPlugins(server) {
  const plugins = [
    Inert,
    Crumb,
    Bell,
    Cookie,
    Scooter,
    csp,
    auth,
    session,
    logging,
    errors,
    headers,
    views,
    router,
    sso
  ]

  await server.register(plugins)
}

export { registerPlugins }

import { listApplicationsController, startApplicationController } from './applications.controller.js'

/** @satisfies {ServerRoute} */
export const listApplicationsRoute = {
  method: 'GET',
  path: '/{slug}/applications',
  ...listApplicationsController
}

/** @satisfies {ServerRoute} */
export const startApplicationRoute = {
  method: 'POST',
  path: '/{slug}/applications',
  ...startApplicationController
}

/** @import { ServerRoute } from '@hapi/hapi' */

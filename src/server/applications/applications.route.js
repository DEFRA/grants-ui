import { ApplicationsController } from './applications.controller.js'

/** @satisfies {ServerRoute} */
export const listApplicationsRoute = {
  method: 'GET',
  path: '/{slug}/applications',
  options: { app: { definitionOnly: true } },
  handler: ApplicationsController.list
}

/** @satisfies {ServerRoute} */
export const startApplicationRoute = {
  method: 'POST',
  path: '/{slug}/applications',
  options: { app: { definitionOnly: true } },
  handler: ApplicationsController.start
}

/** @import { ServerRoute } from '@hapi/hapi' */

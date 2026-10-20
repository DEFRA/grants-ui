import { ApplicationsController } from './applications.controller.js'

const applicationsController = new ApplicationsController()

/** @satisfies {ServerRoute} */
export const listApplicationsRoute = {
  method: 'GET',
  path: '/{slug}/applications',
  options: { app: { definitionOnly: true } },
  handler: applicationsController.list
}

/** @satisfies {ServerRoute} */
export const startApplicationRoute = {
  method: 'POST',
  path: '/{slug}/applications',
  options: { app: { definitionOnly: true } },
  handler: applicationsController.start
}

/** @import { ServerRoute } from '@hapi/hapi' */

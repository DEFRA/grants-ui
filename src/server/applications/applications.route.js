import { ApplicationsController } from './applications.controller.js'
import { APPLICATIONS_PATH } from '../common/constants/applications-path.js'

const applicationsController = new ApplicationsController()

/** @satisfies {ServerRoute} */
export const listApplicationsRoute = {
  method: 'GET',
  path: `/{slug}${APPLICATIONS_PATH}`,
  options: { app: { definitionOnly: true } },
  handler: applicationsController.list
}

/** @satisfies {ServerRoute} */
export const startApplicationRoute = {
  method: 'POST',
  path: `/{slug}${APPLICATIONS_PATH}`,
  options: { app: { definitionOnly: true } },
  handler: applicationsController.start
}

/** @import { ServerRoute } from '@hapi/hapi' */

import { listApplicationsRoute, startApplicationRoute } from './applications.route.js'

export const listApplications = {
  plugin: {
    name: 'applications',
    register: (server) => {
      server.route([listApplicationsRoute, startApplicationRoute])
    }
  }
}

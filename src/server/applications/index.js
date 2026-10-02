import { listApplicationsRoute } from './applications.route.js'

export const listApplications = {
  plugin: {
    name: 'applications',
    register: (server) => {
      server.route([listApplicationsRoute])
    }
  }
}

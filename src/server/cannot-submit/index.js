import { cannotSubmitRoute } from './cannot-submit.route.js'

export const cannotSubmit = {
  plugin: {
    name: 'cannot-submit',

    register: async (server) => {
      server.route([cannotSubmitRoute])
    }
  }
}

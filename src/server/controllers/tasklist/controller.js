import { model } from '../../common/forms/model-definitions/adding-value/adding-value.js'

/**
 * @satisfies {ServerRegisterPluginObject<void>}
 */
export const tasklist = {
  plugin: {
    name: 'tasklist',
    register(server) {
      // const cache = server.cache({
      //   segment: 'test-segment',
      //   expiresIn: 4 * 60 * 60 * 1000 // match the existing rule if needed
      // })
      // console.log('bbbbb', cache)

      server.route({
        method: 'GET',
        path: '/tasklist',
        handler: (_request, h) => {
          // const sessionId = _request.auth
          // const data = await _request.server.app.cache.get(sessionId)

          // const model = {
          //   data: data || {}
          // }
          // console.log('jjjjj', sessionId)

          return h.view('views/tasklist-page', model)
        }
      })
    }
  }
}

/**
 * @import { ServerRegisterPluginObject } from '@hapi/hapi'
 */

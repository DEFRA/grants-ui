import assets from '../routes/assets.js'
import auth from '../routes/auth.js'
import index from '../routes/index.js'
import home from '../routes/home.js'

export default {
  plugin: {
    name: 'router',
    register: (server, _options) => {
      server.route([].concat(
        assets,
        auth,
        index,
        home
      ))
    }
  }
}

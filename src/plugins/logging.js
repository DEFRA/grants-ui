import HapiPino from 'hapi-pino'
import config from '../config/index.js'

export default {
  plugin: HapiPino,
  options: {
    level: config.get('isDev') ? 'info' : 'warn'
  }
}

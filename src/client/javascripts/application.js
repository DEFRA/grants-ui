import { initAll, initMaps } from '@defra/forms-engine-plugin/shared.js'
import './cookie-consent.js'
import '../../server/cookies/cookie-preferences.js'
import '../../server/cookies/append-return-url.js'

initAll()
if (window.componentMapsEnabled) {
  initMaps({
    apiPath: '/api',
    assetPath: '/public/assets'
  })
}

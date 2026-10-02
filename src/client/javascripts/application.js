import { initAll } from '@defra/forms-engine-plugin/shared.js'
import { initialiseComponentMaps } from './component-maps.js'
import './cookie-consent.js'
import '../../server/cookies/cookie-preferences.js'
import '../../server/cookies/append-return-url.js'

initAll()
initialiseComponentMaps()

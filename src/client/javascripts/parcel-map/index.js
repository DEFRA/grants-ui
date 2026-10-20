import { ParcelMap } from './element.js'
import { TAG_NAME } from './config.js'

if (!customElements.get(TAG_NAME)) {
  customElements.define(TAG_NAME, ParcelMap)
}

import Blankie from 'blankie'

export default {
  plugin: Blankie,
  options: {
    fontSrc: ['self'],
    imgSrc: ['self'],
    scriptSrc: ['self', 'unsafe-inline'],
    styleSrc: ['self', 'unsafe-inline'],
    frameAncestors: ['self'],
    formAction: ['self'],
    generateNonces: false
  }
}

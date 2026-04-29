import '@hapi/hapi'

declare module '@hapi/hapi' {
  interface ServerMethods {
    getFormService: () => object
  }
}

import '@hapi/hapi'

declare module '@hapi/hapi' {
  interface ServerMethods {
    getFormService: () => object
  }

  // Mirrors @defra/forms-engine-plugin's augmentation, which our tsc can't
  // resolve because the plugin's .d.ts uses path aliases (~/src/...).
  interface RequestApplicationState {
    model?: {
      def?: {
        metadata?: Record<string, unknown>
      }
    }
  }
}

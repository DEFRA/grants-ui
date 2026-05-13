import '@hapi/hapi'

declare module '@hapi/hapi' {
  interface ServerMethods {
    getFormService: () => object
  }

  interface ServerApplicationState {
    cache: {
      get: (key: string) => Promise<unknown>
      set: (key: string, value: unknown, ttl?: number) => Promise<void>
      drop: (key: string) => Promise<void>
    }
  }

  // Mirrors @defra/forms-engine-plugin's augmentation, which our tsc can't
  // resolve because the plugin's .d.ts uses path aliases (~/src/...).
  interface RequestApplicationState {
    cspNonce?: string
    model?: {
      def?: {
        metadata?: Record<string, unknown>
      }
    }
  }
}

import '@hapi/hapi'
import type { CacheService } from '@defra/forms-engine-plugin/cache-service.js'
import type { FormModel } from '@defra/forms-engine-plugin/engine/models/index.js'

declare module '@hapi/hapi' {
  interface ServerMethods {
    getFormService: () => object
  }

  interface Request {
    // Decorated by the audit-publisher plugin; a no-op when audit is disabled.
    sendAuditEvent: (opts: {
      action: string
      entity?: string
      entityid?: string
      status?: string
      details?: Record<string, unknown>
    }) => Promise<void>
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
    model?: FormModel
  }

  // Mirrors @defra/forms-engine-plugin's hapi augmentation; the plugin's own
  // declaration uses unresolvable ~/src/... path aliases so tsc can't see it.
  interface PluginProperties {
    'forms-engine-plugin': {
      cacheService: CacheService
    }
  }
}

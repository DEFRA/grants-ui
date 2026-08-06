import '@hapi/hapi'
import type { CacheService } from '@defra/forms-engine-plugin/cache-service.js'
import type { FormModel } from '@defra/forms-engine-plugin/engine/models/index.js'

interface AuditEventInput {
  action: string
  entity?: string
  entityid?: string
  status?: string
  details?: Record<string, unknown>
}

declare module '@hapi/hapi' {
  interface ServerMethods {
    getFormService: () => object
  }

  interface Request {
    // Decorated by the audit-publisher plugin; no-ops when audit is disabled.
    // `sendAuditEvent` returns the publish Promise (await it); the
    // `...InBackground` variant is fire-and-forget and returns void.
    sendAuditEvent: (opts: AuditEventInput) => Promise<void>
    sendAuditEventInBackground: (opts: AuditEventInput) => void

    // Decorated by @defra/hapi-auth-oidc (registered in src/server/auth/entraId/index.js).
    login: (h: ResponseToolkit) => Promise<ResponseObject>
    callback: (h: ResponseToolkit) => Promise<{
      accessToken: string
      refreshToken: string
      idToken?: string
      claims: Record<string, unknown>
      expiresIn: number
    } | null>
    ensureValidToken: (token: { accessToken: string, refreshToken: string }) => Promise<{
      token: { accessToken: string, refreshToken: string, idToken?: string, claims?: Record<string, unknown>, expiresIn?: number }
      refreshed: boolean
    }>

    // Decorated by the 'entra-id-session' cookie auth strategy (requestDecoratorName option) -
    // renamed from the scheme's default `cookieAuth` to avoid clashing with the citizen session strategy.
    entraIdCookieAuth: {
      set: (session: { sessionId: string }) => void
      clear: () => void
    }
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

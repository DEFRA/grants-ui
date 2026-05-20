declare module '@defra/hapi-tracing' {
  import { Plugin } from '@hapi/hapi'

  interface TracingOptions {
    tracingHeader?: string
  }

  /** Returns the current request's trace id, or `undefined` if none is set. */
  export function getTraceId(): string | undefined

  /** Appends the trace id to an existing set of headers. */
  export function withTraceId(
    headerName: string,
    headers?: Record<string, string>
  ): Record<string, string>

  /** Hapi plugin that propagates a request trace id via async local storage. */
  export const tracing: {
    plugin: Plugin<TracingOptions>
    options: TracingOptions
  }
}

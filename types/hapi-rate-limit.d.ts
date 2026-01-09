declare module 'hapi-rate-limit' {
  import { Plugin } from '@hapi/hapi'

  interface RateLimitOptions {
    enabled?: boolean
    userAttribute?: string
    addressOnly?: boolean
    trustProxy?: boolean
    getIpFromProxyHeader?: (header: string | undefined) => string | null
    proxyHeaderName?: string
    userLimit?: number | false
    pathLimit?: number | false
    authLimit?: number | false
    userCache?: {
      segment?: string
      expiresIn?: number
    }
    pathCache?: {
      segment?: string
      expiresIn?: number
    }
    headers?: boolean
  }

  const plugin: Plugin<RateLimitOptions>
  export default plugin
}

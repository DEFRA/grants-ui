declare module 'global-agent' {
  interface ProxyAgentConfiguration {
    HTTP_PROXY: string | null
    HTTPS_PROXY: string | null
    NO_PROXY: string | null
  }
  export function bootstrap(configuration?: object): boolean
  export function createGlobalProxyAgent(configuration?: object): ProxyAgentConfiguration
}

// global-agent's bootstrap() assigns the proxy configuration to a global.
// eslint-disable-next-line no-var
declare var GLOBAL_AGENT: {
  HTTP_PROXY: string | null
  HTTPS_PROXY: string | null
  NO_PROXY: string | null
}

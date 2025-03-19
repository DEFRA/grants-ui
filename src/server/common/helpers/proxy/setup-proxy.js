import { ProxyAgent, setGlobalDispatcher } from 'undici'
import { bootstrap } from 'global-agent'
import { createLogger } from '~/src/server/common/helpers/logging/logger.js'
import { config } from '~/src/config/config.js'
const logger = createLogger()

/**
 * If HTTP_PROXY is set setupProxy() will enable it globally
 * for a number of http clients.
 * Node Fetch will still need to pass a ProxyAgent in on each call.
 */
export function setupProxy() {
  const proxyUrl = config.get('httpProxy')

  if (proxyUrl) {
    logger.info('setting up global proxies')

    // Undici proxy
    setGlobalDispatcher(new ProxyAgent(proxyUrl))

    // global-agent (axios/request/and others)
    bootstrap()
    global.GLOBAL_AGENT.HTTP_PROXY = proxyUrl
  }
}

import { HttpsProxyAgent } from 'https-proxy-agent'
import { URL } from 'node:url'
import { ProxyAgent } from 'undici'

import { config } from '~/src/config/config.js'
import { createLogger } from '~/src/server/common/helpers/logging/logger.js'

const logger = createLogger()
/**
 * @typedef Proxy
 * @property {URL} url
 * @property {number} port
 * @property {ProxyAgent} proxyAgent
 * @property {HttpsProxyAgent<string>} httpAndHttpsProxyAgent
 */

/**
 * Provide ProxyAgent and HttpsProxyAgent when http/s proxy url config has been set
 * @returns {Proxy|null}
 */
function provideProxy() {
  const proxyUrl = config.get('httpsProxy') ?? config.get('httpProxy')

  if (!proxyUrl) {
    return null
  }

  const url = new URL(proxyUrl)
  const httpPort = 80
  const httpsPort = 443
  // The url.protocol value always has a colon at the end
  const port = url.protocol.toLowerCase() === 'http:' ? httpPort : httpsPort

  logger.debug(`Proxy set up using ${url.origin}:${port}`)

  return {
    url,
    port,
    proxyAgent: new ProxyAgent({
      uri: proxyUrl,
      keepAliveTimeout: 10,
      keepAliveMaxTimeout: 10
    }),
    httpAndHttpsProxyAgent: new HttpsProxyAgent(url)
  }
}

/**
 * Provide fetch with dispatcher ProxyAgent when http/s proxy url config has been set
 * @param {string | URL } url
 * @param {RequestInit} options
 * @returns {Promise}
 */
function proxyFetch(url, options) {
  const proxy = provideProxy()

  if (!proxy) {
    return fetch(url, options)
  }

  logger.debug(
    `Fetching: ${url.toString()} via the proxy: ${proxy?.url.origin}:${proxy.port}`
  )

  return fetch(url, {
    ...options,
    dispatcher: proxy.proxyAgent
  })
}

export { provideProxy, proxyFetch }

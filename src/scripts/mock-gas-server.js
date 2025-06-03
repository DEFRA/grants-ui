import hapi from '@hapi/hapi'
import { pino } from 'pino'
import { config } from '../config/config.js'

const logger = pino()

const LAND_GRANTS_API =
  config.get('landGrants.grantsServiceApiEndpoint') || 'http://localhost:3001'

logger.info(`Mock GAS Server will proxy to: ${LAND_GRANTS_API}`)

const GAS_ACTIONS_MAP = {
  'validate-actions': {
    method: 'POST',
    endpoint: '/actions/validate'
  },
  'calculate-payment': {
    method: 'POST',
    endpoint: '/payments/calculate'
  },
  'get-parcel-details': {
    method: 'GET',
    endpoint: '/parcels/{parcelId}',
    requiredParams: ['parcelId'],
    buildUrl: (endpoint, queryParams) => {
      const { parcelId } = queryParams
      return endpoint.replace('{parcelId}', parcelId)
    }
  }
}

/**
 * Builds the final Land Grants API URL for a given action
 * @param {string} actionName - The GAS action name
 * @param {object} queryParams - Query parameters from the request
 * @returns {object} - { url: string, error?: string }
 */
const buildLandGrantsUrl = (actionName, queryParams = {}) => {
  const actionConfig = GAS_ACTIONS_MAP[actionName]

  if (!actionConfig) {
    return { error: `Unknown action: ${actionName}` }
  }

  if (actionConfig.requiredParams) {
    const missingParams = actionConfig.requiredParams.filter(
      (param) => !queryParams[param]
    )
    if (missingParams.length > 0) {
      return {
        error: `Missing required parameters: ${missingParams.join(', ')}`
      }
    }
  }

  const endpoint = actionConfig.buildUrl
    ? actionConfig.buildUrl(actionConfig.endpoint, queryParams)
    : actionConfig.endpoint

  return { url: `${LAND_GRANTS_API}${endpoint}` }
}

const createMockGasServer = () => {
  return hapi.server({
    port: process.env.MOCK_GAS_PORT ?? 3002,
    host: 'localhost'
  })
}

const server = createMockGasServer()

// Handle application submission: /grants/{grantCode}/applications
server.route({
  method: 'POST',
  path: '/grants/{grantCode}/applications',
  handler: (request, h) => {
    const { grantCode } = request.params
    // const payload = request.payload
    server.log(['info', 'mock-gas'], `POST /grants/${grantCode}/applications`)
    return h.response({}).code(201)
  }
})

// Handle POST actions: /grants/{grantCode}/actions/{actionName}/invoke
server.route({
  method: 'POST',
  path: '/grants/{grantCode}/actions/{actionName}/invoke',
  handler: async (request, h) => {
    try {
      const { actionName, grantCode } = request.params
      const payload = request.payload

      server.log(
        ['info', 'mock-gas'],
        `POST /grants/${grantCode}/actions/${actionName}/invoke`
      )

      const actionConfig = GAS_ACTIONS_MAP[actionName]
      if (!actionConfig) {
        server.log(['error', 'mock-gas'], `Unknown action: ${actionName}`)
        return h.response({ error: `Unknown action: ${actionName}` }).code(404)
      }

      if (actionConfig.method !== 'POST') {
        server.log(
          ['error', 'mock-gas'],
          `Action ${actionName} does not support POST method`
        )
        return h
          .response({
            error: `Action ${actionName} does not support POST method`
          })
          .code(405)
      }

      const { url, error } = buildLandGrantsUrl(actionName)
      if (error) {
        server.log(['error', 'mock-gas'], error)
        return h.response({ error }).code(400)
      }

      server.log(['debug', 'mock-gas'], `→ ${url}`)

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const errorText = await response.text()
        server.log(['error', 'mock-gas'], `${response.status} ${errorText}`)
        return h
          .response({
            error: response.statusText,
            details: errorText
          })
          .code(response.status)
      }

      const data = await response.json()
      server.log(['debug', 'mock-gas'], `Success`)
      return data
    } catch (error) {
      server.log(['error', 'mock-gas'], `Error: ${error.message}`)
      return h.response({ error: error.message }).code(500)
    }
  }
})

// Handle GET actions: /grants/{grantCode}/actions/{actionName}/invoke
server.route({
  method: 'GET',
  path: '/grants/{grantCode}/actions/{actionName}/invoke',
  handler: async (request, h) => {
    try {
      const { actionName, grantCode } = request.params
      const queryParams = request.query

      server.log(
        ['info', 'mock-gas'],
        `GET /grants/${grantCode}/actions/${actionName}/invoke`,
        queryParams
      )

      const actionConfig = GAS_ACTIONS_MAP[actionName]
      if (!actionConfig) {
        server.log(['error', 'mock-gas'], `Unknown action: ${actionName}`)
        return h.response({ error: `Unknown action: ${actionName}` }).code(404)
      }

      if (actionConfig.method !== 'GET') {
        server.log(
          ['error', 'mock-gas'],
          `Action ${actionName} does not support GET method`
        )
        return h
          .response({
            error: `Action ${actionName} does not support GET method`
          })
          .code(405)
      }

      const { url, error } = buildLandGrantsUrl(actionName, queryParams)
      if (error) {
        server.log(['error', 'mock-gas'], error)
        return h.response({ error }).code(400)
      }

      server.log(['debug', 'mock-gas'], `→ ${url}`)

      const response = await fetch(url)

      if (!response.ok) {
        const errorText = await response.text()
        server.log(['error', 'mock-gas'], `${response.status} ${errorText}`)
        return h
          .response({
            error: response.statusText,
            details: errorText
          })
          .code(response.status)
      }

      const data = await response.json()
      server.log(['debug', 'mock-gas'], `Success`)
      return data
    } catch (error) {
      server.log(['error', 'mock-gas'], `Error: ${error.message}`)
      return h.response({ error: error.message }).code(500)
    }
  }
})

// Catch-all route for debugging
server.route({
  method: '*',
  path: '/{any*}',
  handler: (request, h) => {
    server.log(
      ['warn', 'mock-gas'],
      `Unhandled route: ${request.method} ${request.path}`
    )
    return h
      .response({
        error: 'Route not found',
        availableRoutes: [
          'POST /grants/{code}/actions/{name}/invoke',
          'GET /grants/{code}/actions/{name}/invoke'
        ],
        availableActions: Object.keys(GAS_ACTIONS_MAP)
      })
      .code(404)
  }
})

const init = async () => {
  await server.start()
  logger.info(`Mock GAS server running on ${server.info.uri}`)
  logger.info(`Proxying to Land Grants API: ${LAND_GRANTS_API}`)
  logger.info(`Available actions: ${Object.keys(GAS_ACTIONS_MAP).join(', ')}`)
}

process.on('unhandledRejection', (err) => {
  throw err
})

await init()

import Joi from 'joi'
import { MAX_EASTING, MAX_NORTHING } from '~/src/client/javascripts/map-coordinate-utils.js'
import { config } from '~/src/config/config.js'
import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import { logHandledError } from '~/src/server/common/helpers/logging/handled-error.js'
import { LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { ROUTES } from './map-routes.js'

const OS_NAMES_NEAREST_URL = 'https://api.os.uk/search/names/v1/nearest'
const LOOKUP_TIMEOUT_MS = 2000

function formatLocation(entry) {
  const postcodeDistrict =
    entry?.LOCAL_TYPE === 'Postcode' && typeof entry.NAME1 === 'string'
      ? /^([A-Z]{1,2}\d[A-Z\d]?)\s*\d[A-Z]{2}$/i.exec(entry.NAME1.trim())?.[1].toUpperCase()
      : undefined
  const parts = [
    entry?.POSTCODE_DISTRICT || postcodeDistrict,
    entry?.POPULATED_PLACE || entry?.DISTRICT_BOROUGH || entry?.COUNTY_UNITARY
  ]
    .filter((part) => typeof part === 'string' && part.trim())
    .map((part) => part.trim())
  return parts.length ? [...new Set(parts)].join(', ') : null
}

/**
 * A display-only lookup: no application state is read or written.
 * @param {Request} request
 * @param {ResponseToolkit} h
 */
async function approximateLocationHandler(request, h) {
  const apiKey = config.get('maps.forms.apiKey')
  const unavailable = () =>
    h.response({ label: null }).code(statusCodes.serviceUnavailable).header('Cache-Control', 'no-store')
  if (!apiKey) {
    return unavailable()
  }

  const { easting, northing } = request.query
  const url = new URL(OS_NAMES_NEAREST_URL)
  url.searchParams.set('point', `${easting},${northing}`)
  url.searchParams.set('radius', '1000')
  url.searchParams.set('key', apiKey)
  let upstreamStatus = null

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) })
    upstreamStatus = response.status
    if (!response.ok) {
      throw new Error('OS Names approximate location lookup failed')
    }
    const data = await response.json()
    const label = formatLocation(data.results?.[0]?.GAZETTEER_ENTRY)
    return h.response({ label }).header('Cache-Control', 'no-store')
  } catch (error) {
    logHandledError(error, request, {
      fallbackCode: LogCodes.SYSTEM.EXTERNAL_API_ERROR,
      fallbackDetails: { endpoint: OS_NAMES_NEAREST_URL, service: 'os-names', upstreamStatus }
    })
    return unavailable()
  }
}

/** @type {import('@hapi/hapi').ServerRoute} */
export const approximateLocationRoute = {
  method: 'GET',
  path: ROUTES.approximateLocation,
  options: {
    // Like the engine's geocode proxy, support grant journeys without sign-in.
    auth: false,
    validate: {
      query: Joi.object({
        easting: Joi.number().integer().min(0).max(MAX_EASTING).required(),
        northing: Joi.number().integer().min(0).max(MAX_NORTHING).required()
      })
    }
  },
  handler: approximateLocationHandler
}

/**
 * @import { Request, ResponseToolkit } from '@hapi/hapi'
 */

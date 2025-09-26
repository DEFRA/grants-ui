import { ConfirmationService } from './services/confirmation.service.js'
import { getFormsCacheService } from '~/src/server/common/helpers/forms-cache/forms-cache.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'

const HTTP_STATUS = {
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  NOT_IMPLEMENTED: 501,
  INTERNAL_SERVER_ERROR: 500
}

/**
 * Validates request parameters and finds form by slug
 * @param {object} request - Hapi request object
 * @param {object} h - Hapi response toolkit
 * @returns {object} Validation result with form or error response
 */
function validateRequestAndFindForm(request, h) {
  const { slug } = request.params

  if (!slug) {
    log(LogCodes.CONFIRMATION.CONFIRMATION_ERROR, {
      userId: request.auth?.credentials?.userId || 'unknown',
      error: 'No slug provided in confirmation route'
    })
    return { error: h.response('Bad request - missing slug').code(HTTP_STATUS.BAD_REQUEST) }
  }

  const form = ConfirmationService.findFormBySlug(slug)
  if (!form) {
    log(LogCodes.CONFIRMATION.CONFIRMATION_ERROR, {
      userId: request.auth?.credentials?.userId || 'unknown',
      error: `Form not found for slug: ${slug}`
    })
    return { error: h.response('Form not found').code(HTTP_STATUS.NOT_FOUND) }
  }

  return { form, slug }
}

/**
 * Loads and validates confirmation content for the form
 * @param {object} form - Form configuration object
 * @param {object} logger - Request logger
 * @param {string} slug - Form slug
 * @param {object} h - Hapi response toolkit
 * @returns {object} Content result or error response
 */
async function loadConfirmationContent(form, logger, slug, h) {
  const rawConfirmationContent = await ConfirmationService.loadConfirmationContent(form, logger)

  if (!rawConfirmationContent) {
    log(LogCodes.CONFIRMATION.CONFIRMATION_LOAD, {
      userId: 'system',
      grantType: `${slug} (non-config-driven)`
    })
    return { error: h.response('Not config-driven - fallback to forms engine').code(HTTP_STATUS.NOT_IMPLEMENTED) }
  }

  const confirmationContent = ConfirmationService.processConfirmationContent(rawConfirmationContent)

  return { confirmationContent }
}

/**
 * Retrieves reference number from various sources
 * @param {object} request - Hapi request object
 * @param {string} slug - Form slug
 * @returns {object} Reference number result
 */
async function getReferenceNumber(request, slug) {
  const cacheService = getFormsCacheService(request.server)
  const confirmationState = await cacheService.getConfirmationState(request)
  const referenceNumber =
    confirmationState.$$__referenceNumber ||
    request.yar?.get('referenceNumber') ||
    request.yar?.get('$$__referenceNumber')

  if (!referenceNumber) {
    log(LogCodes.CONFIRMATION.CONFIRMATION_ERROR, {
      userId: request.auth?.credentials?.userId || 'unknown',
      error: `No reference number found for slug: ${slug}. confirmationState: ${Boolean(confirmationState)}, hasConfirmationReferenceNumber: ${Boolean(confirmationState?.$$__referenceNumber)}`
    })
  }

  return {
    referenceNumber: referenceNumber || 'Not available',
    businessName: request.yar?.get('businessName'),
    sbi: request.yar?.get('sbi'),
    contactName: request.yar?.get('contactName')
  }
}

/**
 * Builds view model and returns confirmation page response
 * @param {object} confirmationContent - Confirmation content configuration
 * @param {object} sessionData - Session data including reference number
 * @param {object} h - Hapi response toolkit
 * @returns {object} Hapi response
 */
function buildConfirmationResponse(confirmationContent, sessionData, h) {
  const viewModel = ConfirmationService.buildViewModel({
    referenceNumber: sessionData.referenceNumber,
    businessName: sessionData.businessName,
    sbi: sessionData.sbi,
    contactName: sessionData.contactName,
    confirmationContent
  })

  return h.view('confirmation/views/config-confirmation-page', viewModel)
}

/**
 * Handles errors and returns appropriate error response
 * @param {Error} error - Error object
 * @param {object} request - Hapi request object
 * @param {object} h - Hapi response toolkit
 * @returns {object} Error response
 */
function handleError(error, request, h) {
  log(LogCodes.CONFIRMATION.CONFIRMATION_ERROR, {
    userId: request.auth?.credentials?.userId || 'unknown',
    error: `Config-driven confirmation route error for slug: ${request.params?.slug || 'unknown'}. ${error.message}`
  })
  return h.response('Server error').code(HTTP_STATUS.INTERNAL_SERVER_ERROR)
}

/**
 * @satisfies {ServerRegisterPluginObject<void>}
 */
export const configConfirmation = {
  plugin: {
    name: 'config-confirmation',
    register(server) {
      server.route({
        method: 'GET',
        path: '/{slug}/confirmation',
        handler: async (request, h) => {
          try {
            const validationResult = validateRequestAndFindForm(request, h)
            if (validationResult.error) {
              return validationResult.error
            }

            const { form, slug } = validationResult

            const contentResult = await loadConfirmationContent(form, request.logger, slug, h)
            if (contentResult.error) {
              return contentResult.error
            }

            const { confirmationContent } = contentResult
            const sessionData = await getReferenceNumber(request, slug)

            log(LogCodes.CONFIRMATION.CONFIRMATION_SUCCESS, {
              userId: request.auth?.credentials?.userId || 'unknown',
              referenceNumber: sessionData.referenceNumber
            })

            return buildConfirmationResponse(confirmationContent, sessionData, h)
          } catch (error) {
            return handleError(error, request, h)
          }
        }
      })
    }
  }
}

/**
 * @import { ServerRegisterPluginObject } from '@hapi/hapi'
 */

import { ConfirmationService } from './services/confirmation.service.js'
import { getFormsCacheService } from '~/src/server/common/helpers/forms-cache/forms-cache.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { ApplicationStatus } from '~/src/server/common/constants/application-status.js'

const HTTP_STATUS = {
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
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
    log(
      LogCodes.CONFIRMATION.CONFIRMATION_ERROR,
      {
        userId: request.auth?.credentials?.userId || 'unknown',
        error: 'No slug provided in confirmation route'
      },
      request
    )
    return { error: h.response('Bad request - missing slug').code(HTTP_STATUS.BAD_REQUEST) }
  }

  const form = ConfirmationService.findFormBySlug(slug)
  if (!form) {
    log(
      LogCodes.CONFIRMATION.CONFIRMATION_ERROR,
      {
        userId: request.auth?.credentials?.userId || 'unknown',
        error: `Form not found for slug: ${slug}`
      },
      request
    )
    return { error: h.response('Form not found').code(HTTP_STATUS.NOT_FOUND) }
  }

  return { form, slug }
}

/**
 * Loads and validates confirmation content for the form
 * @param {object} form - Form configuration object
 * @returns {Promise<object|null>} Content result with confirmationContent and formDefinition
 */
async function loadConfirmationContent(form) {
  const { confirmationContent: rawConfirmationContent, formDefinition } =
    await ConfirmationService.loadConfirmationContent(form)

  const confirmationContent = rawConfirmationContent
    ? ConfirmationService.processConfirmationContent(rawConfirmationContent)
    : null

  return { confirmationContent, formDefinition }
}

/**
 * Retrieves reference number from various sources
 * @param {object} request - Hapi request object
 * @returns {Promise<object>} Reference number result
 */
async function getReferenceNumber(request) {
  const cacheService = getFormsCacheService(request.server)
  const state = await cacheService.getState(request)
  const referenceNumber = state.$$__referenceNumber

  if (state && state.applicationStatus === ApplicationStatus.SUBMITTED) {
    request.logger.info('ConfirmationController: Application submitted, showing confirmation page')
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
 * @param {object} form - Form object
 * @param {string} slug - Form slug
 * @param {object} formDefinition - Form definition with metadata
 * @param {object} h - Hapi response toolkit
 * @returns {object} Hapi response
 */
function buildConfirmationResponse(confirmationContent, sessionData, form, slug, formDefinition, h) {
  const viewModel = ConfirmationService.buildViewModel({
    referenceNumber: sessionData.referenceNumber,
    businessName: sessionData.businessName,
    sbi: sessionData.sbi,
    contactName: sessionData.contactName,
    confirmationContent,
    form,
    slug,
    formDefinition
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
  log(
    LogCodes.CONFIRMATION.CONFIRMATION_ERROR,
    {
      userId: request.auth?.credentials?.userId || 'unknown',
      error: `Config-driven confirmation route error for slug: ${request.params?.slug || 'unknown'}. ${error.message}`
    },
    request
  )
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

            const { confirmationContent, formDefinition } = await loadConfirmationContent(form)
            const sessionData = await getReferenceNumber(request)

            log(
              LogCodes.CONFIRMATION.CONFIRMATION_SUCCESS,
              {
                userId: request.auth?.credentials?.userId || 'unknown',
                referenceNumber: sessionData.referenceNumber
              },
              request
            )

            return buildConfirmationResponse(confirmationContent, sessionData, form, slug, formDefinition, h)
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

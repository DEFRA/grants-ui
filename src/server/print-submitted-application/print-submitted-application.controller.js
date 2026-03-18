import { readFile } from 'node:fs/promises'
import { parse as parseYaml } from 'yaml'
import { getFormsCacheService } from '~/src/server/common/helpers/forms-cache/forms-cache.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { ApplicationStatus } from '~/src/server/common/constants/application-status.js'
import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import { findFormBySlug } from '../common/forms/services/find-form-by-slug.js'
import {
  buildPrintViewModel,
  enrichDefinitionWithListItems,
  processConfigurablePrintContent
} from '../common/helpers/print-application-service/print-application-service.js'
import { fetchBusinessAndCustomerInformation } from '~/src/server/common/services/consolidated-view/consolidated-view.service.js'
import { createPersonRows, createBusinessRows, createContactRows } from '~/src/server/common/helpers/create-rows.js'

/**
 * Validates the request has a slug param and finds the matching form definition.
 * @param {Request} request
 * @param {ResponseToolkit} h
 */
function validateRequestAndFindForm(request, h) {
  const { slug } = request.params

  if (!slug) {
    return { error: h.response('Bad request - missing slug').code(statusCodes.badRequest) }
  }

  const form = findFormBySlug(slug)
  if (!form) {
    return { error: h.response('Form not found').code(statusCodes.notFound) }
  }

  return { form, slug }
}

/**
 * Loads the application state from the session cache and returns it only if submitted.
 * @param {Request} request
 */
async function loadSubmittedApplication(request) {
  const cacheService = getFormsCacheService(request.server)
  const state = await cacheService.getState(request)

  if (state?.applicationStatus !== ApplicationStatus.SUBMITTED) {
    return null
  }

  return state
}

/**
 * Logs an applicant details fetch failure.
 * @param {Error} error
 * @param {Request} request
 */
function logApplicantDetailsFetchError(error, request) {
  log(
    LogCodes.PRINT_APPLICATION.ERROR,
    {
      userId: request.auth?.credentials?.userId || 'unknown',
      errorMessage: `Failed to fetch applicant details: ${error.message}`,
      slug: request.params?.slug
    },
    request
  )
}

/**
 * Resolves applicant details sections for forms that have showApplicantDetails enabled.
 * @param {Request} request
 * @param {Record<string, any>} state
 * @param {{ metadata?: { printPage?: { showApplicantDetails?: boolean } } }} definition
 * @returns {Promise<{ person: { rows: object[] }, business: { rows: object[] }, contact: { rows: object[] } } | null>}
 */
async function resolveApplicantDetailsSections(request, state, definition) {
  if (!definition.metadata?.printPage?.showApplicantDetails) {
    return null
  }

  let applicantData = null

  if (state.applicant?.customer || state.applicant?.business?.name) {
    applicantData = state.applicant
  } else {
    try {
      applicantData = await fetchBusinessAndCustomerInformation(request)
    } catch (error) {
      logApplicantDetailsFetchError(error, request)
      return null
    }
  }

  const sbi = /** @type {string} */ (request.auth?.credentials?.sbi ?? '')

  return {
    person: createPersonRows(applicantData.customer?.name),
    business: createBusinessRows(sbi, applicantData.business),
    contact: createContactRows(applicantData.business)
  }
}

/**
 * Reads the YAML form definition, builds the print view model and renders the view.
 * @param {{ form: import('../common/helpers/print-application-service/print-application-service.js').FormMeta, state: Record<string, any>, slug: string }} params
 * @param {Request} request
 * @param {ResponseToolkit} h
 */
async function buildPrintResponse({ form, state, slug }, request, h) {
  const raw = await readFile(form.path, 'utf8')
  const definition = parseYaml(raw)

  enrichDefinitionWithListItems(definition)

  const configurablePrintContent = processConfigurablePrintContent(
    definition.metadata?.printPage?.configurablePrintContent,
    slug
  )

  const applicant = state.applicant || {}
  const customerName = applicant.customer?.name
  const sessionData = {
    contactName: customerName
      ? [customerName.title, customerName.first, customerName.middle, customerName.last].filter(Boolean).join(' ') ||
        undefined
      : undefined,
    businessName: applicant.business?.name,
    sbi: /** @type {string | undefined} */ (request.auth?.credentials?.sbi)
  }

  const applicantDetailsSections = await resolveApplicantDetailsSections(request, state, definition)

  const viewModel = buildPrintViewModel({
    definition,
    form,
    answers: state,
    referenceNumber: state.$$__referenceNumber,
    submittedAt: state.submittedAt,
    slug,
    sessionData,
    configurablePrintContent,
    applicantDetailsSections
  })

  return h.view('print-submitted-application', viewModel)
}

/**
 * Logs the error details and returns a 500 response.
 * @param {Error} error
 * @param {Request} request
 * @param {ResponseToolkit} h
 */
function handleError(error, request, h) {
  log(
    LogCodes.PRINT_APPLICATION.ERROR,
    {
      userId: request.auth?.credentials?.userId || 'unknown',
      errorMessage: error.message,
      slug: request.params?.slug
    },
    request
  )

  return h.response('Server error').code(statusCodes.internalServerError)
}

/**
 * Hapi plugin that registers the GET /{slug}/print-submitted-application route.
 * @satisfies {ServerRegisterPluginObject<void>}
 */
export const printSubmittedApplication = {
  plugin: {
    name: 'print-submitted-application',
    register(server) {
      server.route({
        method: 'GET',
        path: '/{slug}/print-submitted-application',
        handler: async (request, h) => {
          try {
            const validationResult = validateRequestAndFindForm(request, h)
            if (validationResult.error) {
              return validationResult.error
            }

            const { form, slug } = validationResult

            const state = await loadSubmittedApplication(request)
            if (!state) {
              return h.response('Application not submitted').code(statusCodes.forbidden)
            }

            log(
              LogCodes.PRINT_APPLICATION.SUCCESS,
              {
                referenceNumber: state.$$__referenceNumber || 'unknown'
              },
              request
            )

            return await buildPrintResponse({ form, state, slug }, request, h)
          } catch (error) {
            return handleError(error, request, h)
          }
        }
      })
    }
  }
}

/**
 * @import { Request, ResponseToolkit, ServerRegisterPluginObject } from '@hapi/hapi'
 */

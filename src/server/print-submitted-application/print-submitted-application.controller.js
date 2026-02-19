import { readFile } from 'node:fs/promises'
import { parse as parseYaml } from 'yaml'
import { getFormsCacheService } from '~/src/server/common/helpers/forms-cache/forms-cache.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { ApplicationStatus } from '~/src/server/common/constants/application-status.js'
import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import {
  findFormBySlug,
  buildPrintViewModel
} from '../common/helpers/print-application-service/print-application-service.js'

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
 * Reads the YAML form definition, builds the print view model and renders the view.
 * @param {{ form: import('../common/helpers/print-application-service/print-application-service.js').FormMeta, state: Record<string, any>, slug: string }} params
 * @param {Request} request
 * @param {ResponseToolkit} h
 */
async function buildPrintResponse({ form, state, slug }, request, h) {
  const raw = await readFile(form.path, 'utf8')
  const definition = parseYaml(raw)

  const sessionData = {
    businessName: /** @type {string | undefined} */ (request.yar?.get('businessName')),
    sbi: /** @type {string | undefined} */ (request.yar?.get('sbi')),
    contactName: /** @type {string | undefined} */ (request.yar?.get('contactName'))
  }

  const viewModel = buildPrintViewModel({
    definition,
    form,
    answers: state,
    referenceNumber: state.$$__referenceNumber,
    submittedAt: state.submittedAt,
    slug,
    sessionData
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

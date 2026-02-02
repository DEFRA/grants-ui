import { getFormsCacheService } from '~/src/server/common/helpers/forms-cache/forms-cache.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { ApplicationStatus } from '~/src/server/common/constants/application-status.js'
import { PrintApplicationService } from '../common/helpers/print-application-service/print-application-service.js'

const HTTP_STATUS = {
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  INTERNAL_SERVER_ERROR: 500
}

function validateRequestAndFindForm(request, h) {
  const { slug } = request.params

  if (!slug) {
    return { error: h.response('Bad request - missing slug').code(HTTP_STATUS.BAD_REQUEST) }
  }

  const form = PrintApplicationService.findFormBySlug(slug)
  if (!form) {
    return { error: h.response('Form not found').code(HTTP_STATUS.NOT_FOUND) }
  }

  return { form, slug }
}

async function loadSubmittedApplication(request) {
  const cacheService = getFormsCacheService(request.server)
  const state = await cacheService.getState(request)

  if (!state || state.applicationStatus !== ApplicationStatus.SUBMITTED) {
    return null
  }

  return state
}

function buildPrintResponse({ form, submission, slug }, h) {
  const viewModel = PrintApplicationService.buildPrintViewModel({
    form,
    answers: submission.answers,
    referenceNumber: submission.$$__referenceNumber,
    submittedAt: submission.submittedAt,
    slug
  })

  return h.view('print-submitted-application', viewModel)
}

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

  return h.response('Server error').code(HTTP_STATUS.INTERNAL_SERVER_ERROR)
}

/**
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

            const submission = await loadSubmittedApplication(request)
            if (!submission) {
              return h.response('Application not submitted').code(HTTP_STATUS.FORBIDDEN)
            }

            log(
              LogCodes.PRINT_APPLICATION.SUCCESS,
              {
                referenceNumber: submission.$$__referenceNumber || 'unknown'
              },
              request
            )

            return buildPrintResponse({ ...validationResult, submission }, h)
          } catch (error) {
            return handleError(error, request, h)
          }
        }
      })
    }
  }
}

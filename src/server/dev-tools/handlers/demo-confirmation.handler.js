import { buildDemoData, generateFormNotFoundResponse } from '../utils/index.js'
import { ConfirmationService } from '../../confirmation/services/confirmation.service.js'
import { log, LogCodes } from '../../common/helpers/logging/log.js'

/**
 * Load confirmation content with development fallback
 * @param {object} form - Form object
 * @returns {Promise<{confirmationContent: object}>} Confirmation content
 */
export async function loadConfirmationContent(form) {
  const { confirmationContent: rawConfirmationContent } = await ConfirmationService.loadConfirmationContent(form)

  if (!rawConfirmationContent) {
    return {
      confirmationContent: {
        html: `<h2 class="govuk-heading-m">What happens next (Development Mode)</h2>
               <p class="govuk-body"><strong>⚠️ This is demo content - no configuration found.</strong></p>
               <p class="govuk-body">Form: ${form.title} (${form.slug})</p>
               <p class="govuk-body">Showing fallback demonstration content...</p>`
      }
    }
  }

  const confirmationContent = ConfirmationService.processConfirmationContent(rawConfirmationContent)

  return { confirmationContent }
}

/**
 * Build view model for confirmation page in development mode
 * @param {object} demoData - Demo data object
 * @param {object} confirmationContent - Confirmation content from config
 * @param {object} form - Form object
 * @param {string} slug - Form slug
 * @returns {object} View model for template
 */
export function buildViewModel(demoData, confirmationContent, form, slug) {
  return ConfirmationService.buildViewModel({
    ...demoData,
    confirmationContent,
    isDevelopmentMode: true,
    form,
    slug
  })
}

/**
 * Generate fallback error view model
 * @param {Error} error - Error object
 * @returns {object} Fallback view model
 */
export function generateFallbackViewModel(error) {
  const demoData = buildDemoData()

  return ConfirmationService.buildViewModel({
    ...demoData,
    isDevelopmentMode: true,
    confirmationContent: {
      html: `<h2 class="govuk-heading-m">Development Error</h2>
             <p class="govuk-body"><strong>⚠️ Development mode error occurred.</strong></p>
             <p class="govuk-body">Error: ${error.message}</p>
             <p class="govuk-body">This page is for development testing only.</p>`
    }
  })
}

/**
 * Main demo confirmation handler
 * @param {object} request - Hapi request object
 * @param {object} h - Hapi response toolkit
 * @returns {Promise<object>} Hapi response
 */
export async function demoConfirmationHandler(request, h) {
  try {
    const { slug } = request.params

    const form = ConfirmationService.findFormBySlug(slug)

    if (!form) {
      return generateFormNotFoundResponse(slug, h)
    }

    const { confirmationContent } = await loadConfirmationContent(form)
    const demoData = buildDemoData()
    const viewModel = buildViewModel(demoData, confirmationContent, form, slug)

    return h.view('confirmation/views/config-confirmation-page', viewModel)
  } catch (error) {
    log(LogCodes.CONFIRMATION.CONFIRMATION_ERROR, {
      userId: 'demo',
      error: `Demo confirmation route error: ${error.message}`
    })

    const fallbackViewModel = generateFallbackViewModel(error)
    return h.view('confirmation/views/config-confirmation-page', fallbackViewModel)
  }
}

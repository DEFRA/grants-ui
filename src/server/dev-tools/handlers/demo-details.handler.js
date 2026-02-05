import { buildDemoMappedData, buildDemoRequest } from '../helpers/index.js'
import { generateFormNotFoundResponse, getAllForms } from '../utils/index.js'
import { processSections } from '../../common/services/details-page/index.js'
import { log, LogCodes } from '../../common/helpers/logging/log.js'

const CHECK_DETAILS_VIEW = 'check-details'

/**
 * Load display sections config from form
 * @param {object} form - Form object
 * @returns {{displaySections: object[]|null}} Display sections config or null if not found
 */
export function loadDisplaySectionsConfig(form) {
  const displaySections = form?.metadata?.detailsPage?.displaySections

  if (!displaySections) {
    return { displaySections: null }
  }

  return { displaySections }
}

/**
 * Validates that slug is a known form slug to prevent open redirect
 * @param {string} slug - Slug to validate
 * @returns {boolean} True if slug is valid
 */
function isValidFormSlug(slug) {
  if (!slug || typeof slug !== 'string') {
    return false
  }
  const allForms = getAllForms()
  return allForms.some((f) => f.slug === slug)
}

/**
 * Find form by slug
 * @param {string} slug - Form slug to find
 * @returns {object|null} Form object or null
 */
function findFormBySlug(slug) {
  if (!isValidFormSlug(slug)) {
    return null
  }
  const allForms = getAllForms()
  return allForms.find((f) => f.slug === slug) || null
}

/**
 * Build base view model for details page
 * @param {object} options - View model options
 * @param {object[]} options.sections - Processed sections array
 * @param {object} options.form - Form object
 * @param {string} options.slug - Form slug
 * @returns {object} View model for template
 */
function buildBaseViewModel({ sections, form, slug }) {
  return {
    pageTitle: 'Check your details are correct',
    sections,
    serviceName: form?.title || 'Check your details',
    serviceUrl: slug ? `/${slug}` : '/',
    breadcrumbs: [],
    isDevelopmentMode: true,
    formTitle: form?.title,
    formSlug: slug,
    // Add dev mode user details for account bar (auth strategy is disabled for dev routes)
    auth: {
      name: 'Dev Mode User',
      organisationName: 'Dev Mode Organisation',
      organisationId: '999999999'
    }
  }
}

/**
 * Build view model for details page in development mode
 * @param {object[]} sections - Processed sections array
 * @param {object} form - Form object
 * @param {string} slug - Form slug
 * @returns {object} View model for template
 */
export function buildViewModel(sections, form, slug) {
  return buildBaseViewModel({ sections, form, slug })
}

/**
 * Generate fallback error view model
 * @param {Error} error - Error object
 * @returns {object} Fallback view model
 */
export function generateFallbackViewModel(error) {
  return buildBaseViewModel({
    sections: [
      {
        title: { text: 'Error' },
        summaryList: {
          rows: [
            {
              key: { text: 'Error' },
              value: { html: `<strong>Development Error</strong><br/>${error.message}` }
            }
          ]
        }
      }
    ],
    form: { title: 'Development Error' },
    slug: ''
  })
}

/**
 * Build view model for incorrect details page
 * @param {object} form - Form object
 * @param {string} slug - Form slug
 * @returns {object} View model for incorrect details template
 */
export function buildIncorrectDetailsViewModel(form, slug) {
  return {
    serviceName: form?.title || 'Check your details',
    serviceUrl: slug ? `/${slug}` : '/',
    continueUrl: slug ? `/${slug}` : '/',
    isDevelopmentMode: true
  }
}

/**
 * Main demo details handler
 * @param {object} request - Hapi request object
 * @param {object} h - Hapi response toolkit
 * @returns {Promise<object>} Hapi response
 */
export async function demoDetailsHandler(request, h) {
  try {
    const { slug } = request.params

    const form = findFormBySlug(slug)

    if (!form) {
      return generateFormNotFoundResponse(slug, h)
    }

    const { displaySections } = loadDisplaySectionsConfig(form)

    if (!displaySections) {
      const noConfigViewModel = buildBaseViewModel({
        sections: [
          {
            title: { text: 'No Configuration Found' },
            summaryList: {
              rows: [
                {
                  key: { text: 'Status' },
                  value: {
                    html: `<strong>Development Mode</strong><br/>No displaySections config found in form metadata.detailsPage for: ${form.title} (${slug})`
                  }
                }
              ]
            }
          }
        ],
        form,
        slug
      })
      return h.view(CHECK_DETAILS_VIEW, noConfigViewModel)
    }

    const demoMappedData = buildDemoMappedData()
    const demoRequest = buildDemoRequest()

    const sections = processSections(displaySections, demoMappedData, demoRequest)
    const viewModel = buildViewModel(sections, form, slug)

    return h.view(CHECK_DETAILS_VIEW, viewModel)
  } catch (error) {
    log(LogCodes.CONFIRMATION.CONFIRMATION_ERROR, {
      userId: 'demo',
      errorMessage: `Demo details route error: ${error.message}`
    })

    const fallbackViewModel = generateFallbackViewModel(error)
    return h.view(CHECK_DETAILS_VIEW, fallbackViewModel)
  }
}

/**
 * POST handler for demo details form submission
 * Redirects to confirmation page if details are correct,
 * or shows incorrect details page if user selects "No"
 * @param {object} request - Hapi request object
 * @param {object} h - Hapi response toolkit
 * @returns {Promise<object>} Hapi response
 */
export async function demoDetailsPostHandler(request, h) {
  const { slug } = request.params
  const { detailsCorrect } = request.payload || {}

  const form = findFormBySlug(slug)

  if (!form) {
    return generateFormNotFoundResponse(slug, h)
  }

  if (detailsCorrect === undefined || detailsCorrect === null) {
    const { displaySections } = loadDisplaySectionsConfig(form)

    const demoMappedData = buildDemoMappedData()
    const demoRequest = buildDemoRequest()

    const sections = displaySections ? processSections(displaySections, demoMappedData, demoRequest) : []

    const viewModel = {
      ...buildViewModel(sections, form, slug),
      errors: [
        {
          text: 'Select yes if your details are correct',
          href: '#detailsCorrect'
        }
      ]
    }

    return h.view(CHECK_DETAILS_VIEW, viewModel)
  }

  if (detailsCorrect === 'true') {
    // Validate slug is a known form slug before redirect to prevent open redirect
    if (!isValidFormSlug(slug)) {
      return generateFormNotFoundResponse(slug, h)
    }
    return h.redirect(`/${slug}`)
  }

  const incorrectDetailsViewModel = buildIncorrectDetailsViewModel(form, slug)
  return h.view('incorrect-details', incorrectDetailsViewModel)
}

import { formsService, getFormsCache } from '~/src/server/common/forms/services/form.js'
import { ComponentsRegistry } from './components.registry.js'
import { logger } from '~/src/server/common/helpers/logging/log.js'

/**
 * @typedef {object} FormsService
 * @property {(slug: string) => Promise<object>} getFormMetadata
 * @property {(id: string, state?: object) => Promise<object>} getFormDefinition
 */

let memoisedFormsServicePromise

/**
 * Resolve a forms service instance, preferring an injected singleton and falling back to a shared memoised instance.
 * @param {FormsService} [providedService]
 * @returns {Promise<FormsService>}
 */
async function resolveFormsService(providedService) {
  if (providedService) {
    return providedService
  }

  if (!memoisedFormsServicePromise) {
    memoisedFormsServicePromise = formsService()
  }

  return memoisedFormsServicePromise
}

export class ConfirmationService {
  /**
   * Find form by slug from cache
   * @param {string} slug - Form slug to find
   * @returns {object|null} Form object or null if not found
   */
  static findFormBySlug(slug) {
    const allForms = getFormsCache()
    return allForms.find((f) => f.slug === slug) || null
  }

  /**
   * Load confirmation content and form definition metadata
   * @param {object} form - Form object
   * @returns {Promise<{confirmationContent: object|null, formDefinition: object|null}>} Confirmation content and form definition
   */
  static async loadConfirmationContent(form, providedService) {
    if (!form?.id) {
      logger.warn({ form }, 'Invalid form object provided to loadConfirmationContent')
      return { confirmationContent: null, formDefinition: null }
    }

    try {
      const service = await resolveFormsService(providedService)
      const formDefinition = await service.getFormDefinition(form.id)
      return {
        confirmationContent: formDefinition?.metadata?.confirmationContent || null,
        formDefinition: formDefinition || null
      }
    } catch (error) {
      logger.warn(
        {
          error: error.message,
          slug: form.slug,
          formId: form.id
        },
        'Failed to load form configuration'
      )
      return { confirmationContent: null, formDefinition: null }
    }
  }

  /**
   * Process confirmation content - replace component placeholders
   * @param {object} confirmationContent - Raw confirmation content from YAML
   * @returns {object} Processed confirmation content
   */
  static processConfirmationContent(confirmationContent) {
    if (!confirmationContent) {
      return null
    }

    if (confirmationContent.html) {
      const processedHtml = ComponentsRegistry.replaceComponents(confirmationContent.html)
      return {
        ...confirmationContent,
        html: processedHtml
      }
    }

    return confirmationContent
  }

  /**
   * Build view model for confirmation page
   * @param {object} options - Configuration options
   * @param {string} options.referenceNumber - Application reference number
   * @param {string} options.businessName - Business name
   * @param {string} options.sbi - SBI number
   * @param {string} options.contactName - Contact name
   * @param {object} options.confirmationContent - Confirmation content from config
   * @param {boolean} [options.isDevelopmentMode] - Whether in development mode
   * @param {object} [options.form] - Form object (optional)
   * @param {string | null} [options.slug] - Form slug (optional)
   * @param {object} [options.formDefinition] - Form definition with metadata (optional)
   * @returns {object} View model for template
   */
  static buildViewModel({
    referenceNumber,
    businessName,
    sbi,
    contactName,
    confirmationContent,
    isDevelopmentMode = false,
    form = null,
    slug = null
  }) {
    const title = form.title
    const url = `/${slug}`

    const baseModel = {
      pageTitle: 'Confirmation',
      referenceNumber,
      businessName,
      sbi,
      contactName,
      confirmationContent,
      serviceName: title,
      serviceUrl: url,
      auth: {},
      breadcrumbs: []
    }

    if (isDevelopmentMode) {
      return {
        ...baseModel,
        isDevelopmentMode: true,
        formTitle: title,
        formSlug: url,
        usingSessionData: false,
        // Add dev mode user details as auth strategy is disabled for dev routes
        auth: {
          name: 'Dev Mode User',
          organisationName: 'Dev Mode Organisation',
          organisationId: '999999999'
        }
      }
    }

    return baseModel
  }

  /**
   * Check if form has configuration-driven confirmation content
   * @param {object} form - Form object
   * @returns {Promise<boolean>} True if form has config-driven confirmation
   */
  static async hasConfigDrivenConfirmation(form, providedService) {
    const { confirmationContent } = await this.loadConfirmationContent(form, providedService)
    return !!confirmationContent
  }
}

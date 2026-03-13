import nunjucks from 'nunjucks'

import { ComponentsRegistry } from './components.registry.js'
import { logger } from '~/src/server/common/helpers/logging/log.js'
import { config } from '~/src/config/config.js'

export class ConfirmationService {
  /**
   * Load confirmation content
   * @param {object} form - Form object
   * @returns {Promise<{confirmationContent: object|null}>} Confirmation content
   */
  static async loadConfirmationContent(form) {
    if (!form?.id) {
      logger.warn({ form }, 'Invalid form object provided to loadConfirmationContent')
      return { confirmationContent: null }
    }

    return {
      confirmationContent: form?.metadata?.confirmationContent || null
    }
  }

  /**
   * Process confirmation content - replace component placeholders, slug tokens,
   * and render Nunjucks template syntax with provided context
   * @param {object} confirmationContent - Raw confirmation content from YAML
   * @param {string} [slug] - Form slug for replacing {{SLUG}} placeholders
   * @param {object} [context] - Context object for Nunjucks template rendering
   * @returns {object} Processed confirmation content
   */
  static processConfirmationContent(confirmationContent, slug, context = {}) {
    if (!confirmationContent) {
      return null
    }

    if (confirmationContent.html) {
      let processedHtml = ComponentsRegistry.replaceComponents(confirmationContent.html)

      if (slug) {
        processedHtml = processedHtml.replaceAll('{{SLUG}}', slug)
      }

      processedHtml = nunjucks.renderString(processedHtml, context)
      if (slug === 'farm-payments' && !config.get('landGrants.enablePrintApplication')) {
        processedHtml = processedHtml.replaceAll(
          /<p[^>]*>[^<]*<a[^>]*print-submitted-application[^>]*>[^<]*<\/a>[^<]*<\/p>/g,
          ''
        )
      }

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
  static async hasConfigDrivenConfirmation(form) {
    const { confirmationContent } = await this.loadConfirmationContent(form)
    return !!confirmationContent
  }
}

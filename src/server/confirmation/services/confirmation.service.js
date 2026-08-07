import nunjucks from 'nunjucks'

import { ComponentsRegistry } from './components.registry.js'

export class ConfirmationService {
  /**
   * Load confirmation content for a specific page from the per-page `config:`
   * block that `hoistPageConfig` moves onto `metadata.pageConfig[path]`.
   * @param {FormLike} form - Form object
   * @param {string} [path] - Forms-engine page path (e.g. `/confirmation`)
   * @returns {Promise<{confirmationContent: ConfirmationContent|null}>} Confirmation content
   */
  static async loadConfirmationContent(form, path = '/confirmation') {
    return {
      confirmationContent: form?.metadata?.pageConfig?.[path] || null
    }
  }

  /**
   * Process confirmation content - replace component placeholders, slug tokens,
   * and render Nunjucks template syntax with provided context. The body `html`
   * supports dynamic state values (e.g. `{{ referenceNumber }}`). Used by the
   * dev demo confirmation handler, which supplies an `html` string body.
   * @param {ConfirmationContent} confirmationContent - Raw confirmation content from YAML
   * @param {string} [slug] - Form slug for replacing {{SLUG}} placeholders
   * @param {object} [context] - Context object for Nunjucks template rendering
   * @returns {ConfirmationContent | null} Processed confirmation content
   */
  static processConfirmationContent(confirmationContent, slug, context = {}) {
    if (!confirmationContent) {
      return null
    }

    if (!confirmationContent.html) {
      return confirmationContent
    }

    const processed = { ...confirmationContent }

    let processedHtml = ComponentsRegistry.replaceComponents(confirmationContent.html)

    if (slug) {
      processedHtml = processedHtml.replaceAll('{{SLUG}}', slug)
    }

    processed.html = nunjucks.renderString(processedHtml, context)

    return processed
  }

  /**
   * Build view model for confirmation page
   * @param {object} options - Configuration options
   * @param {string} options.referenceNumber - Application reference number
   * @param {string} [options.businessName] - Business name
   * @param {string} [options.sbi] - SBI number
   * @param {string} [options.contactName] - Contact name
   * @param {ConfirmationContent | null} options.confirmationContent - Confirmation content from config
   * @param {boolean} [options.isDevelopmentMode] - Whether in development mode
   * @param {FormLike | null} [options.form] - Form object (optional)
   * @param {string | null} [options.slug] - Form slug (optional)
   * @param {object[] | null} [options.components] - Rendered page components for the confirmation body
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
    slug = null,
    components = null
  }) {
    const title = /** @type {FormLike} */ (form)?.name
    const url = `/${slug}`

    const baseModel = {
      pageTitle: 'Confirmation',
      referenceNumber,
      businessName,
      sbi,
      contactName,
      confirmationContent,
      components,
      serviceName: title,
      serviceUrl: url,
      breadcrumbs: [],
      supportEmail: form?.metadata?.supportEmail ?? null
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
          sbi: '999999999'
        }
      }
    }

    return baseModel
  }

  /**
   * Check if form has configuration-driven confirmation content for a page
   * @param {FormLike} form - Form object
   * @param {string} [path] - Forms-engine page path (e.g. `/confirmation`)
   * @returns {Promise<boolean>} True if form has config-driven confirmation
   */
  static async hasConfigDrivenConfirmation(form, path = '/confirmation') {
    const { confirmationContent } = await this.loadConfirmationContent(form, path)
    return !!confirmationContent
  }
}

/**
 * @typedef {object} ConfirmationContent
 * @property {string} [panelTitle] - Confirmation panel heading
 * @property {string} [panelText] - Text shown above the reference in the panel
 * @property {string} [html] - HTML body of the confirmation content (dev demo fallback)
 * @property {{ text?: string, href?: string }} [button] - Optional call-to-action button
 */

/**
 * @typedef {object} FormLike
 * @property {string} [name] - Form/service name
 * @property {object} [metadata] - Form metadata
 * @property {Record<string, ConfirmationContent>} [metadata.pageConfig] - Per-page config blocks
 * @property {string} [metadata.slug] - Form slug
 * @property {string | null} [metadata.supportEmail] - Support email address
 */

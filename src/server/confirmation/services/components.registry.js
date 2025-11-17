export class ComponentsRegistry {
  static components = new Map()

  /**
   * Register a component with the registry
   * @param {string} name - Component name
   * @param {string} html - Component HTML content
   */
  static register(name, html) {
    this.components.set(name, html)
  }

  /**
   * Replace component placeholders in content
   * @param {string} content - Content with placeholders
   * @returns {string} Content with placeholders replaced
   */
  static replaceComponents(content) {
    if (!content) {
      return content
    }

    let processedContent = content

    for (const [name, html] of this.components) {
      const placeholder = `{{${name.toUpperCase()}}}`
      processedContent = processedContent.replaceAll(placeholder, html)
    }

    return processedContent
  }
}

ComponentsRegistry.register(
  'defraSupportDetails',
  `
<details class="govuk-details" data-module="govuk-details">
  <summary class="govuk-details__summary">
    <span class="govuk-details__summary-text">
      If you have a question
    </span>
  </summary>
  <div class="govuk-details__text">
    <p class="govuk-body">Contact the Rural Payments Agency (RPA) if you have a query.</p>
    <p class="govuk-body">
      Telephone: 03000 200 301<br>
      Monday to Friday, 8:30am to 5pm (except bank holidays)</p>
    <p class="govuk-body"><a class="govuk-link" href="https://www.gov.uk/call-charges" target="_blank">Find out about call charges (opens in new tab)</a></p>
    <p class="govuk-body">Email: <a class="govuk-link" href="mailto:farmpayments@rpa.gov.uk">farmpayments@rpa.gov.uk</a></p>
    <p class="govuk-body">The RPA responds to email queries within 10 working days.</p>
  </div>
</details>
`.trim()
)

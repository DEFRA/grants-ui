export default class PrintSubmittedApplicationPage {
  constructor(page) {
    this.page = page
  }

  async referenceNumber() {
    return (await this.page.locator("//p[contains(text(),'Application number:')]/strong").textContent()).trim()
  }

  /** Rows of the main answer lists; repeat item cards are checked separately. */
  async submittedAnswers() {
    const rows = this.page.locator('main .app-submitted-answers > .govuk-summary-list__row')
    await rows.first().waitFor({ state: 'visible' })

    return rows.evaluateAll((elements) =>
      elements
        .filter((row) => !row.closest('.govuk-summary-card'))
        .map((row) => ({
          question: row.querySelector('dt').textContent.trim(),
          answer: row.querySelector('dd:nth-child(2)').textContent.trim()
        }))
    )
  }

  async applicantDetails() {
    const details = []

    for (const section of ['Your details', 'Business details', 'Contact details']) {
      for (let i = 1; ; i++) {
        const row = this.page.locator(`//h3[text()='${section}']/following-sibling::dl[1]/div[${i}]`)
        if (!(await row.isVisible().catch(() => false))) {
          break
        }

        const title = (await row.locator('dt').textContent()).trim()
        const value = (await row.locator('dd:nth-child(2)').textContent()).trim()
        details.push({ title, value })
      }
    }

    return details
  }

  async hasConfigurableContent(text) {
    return (await this.page.locator(`//*[contains(.,'${text}')]`).count()) > 0
  }
}

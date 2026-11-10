export default class PrintSubmittedApplicationPage {
  constructor(page) {
    this.page = page
  }

  async referenceNumber() {
    return (await this.page.locator("//p[contains(text(),'Application number:')]/strong").textContent()).trim()
  }

  async submittedAnswers() {
    const submittedAnswers = []

    const rows = this.page.locator('main .app-submitted-answers > .govuk-summary-list__row')
    await rows.first().waitFor({ state: 'visible' })
    const rowCount = await rows.count()

    for (let i = 0; i < rowCount; i++) {
      const row = rows.nth(i)

      const question = (await row.locator('dt').textContent()).trim()
      const answer = (await row.locator('dd:nth-child(2)').textContent()).trim()
      submittedAnswers.push({ question, answer })
    }

    return submittedAnswers
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

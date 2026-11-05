export default class CheckDetailsPage {
  constructor(page) {
    this.page = page
  }

  async details() {
    const details = []

    const rows = this.page.locator('main .govuk-summary-list > .govuk-summary-list__row')
    await rows.first().waitFor({ state: 'visible' })
    const rowCount = await rows.count()

    for (let i = 0; i < rowCount; i++) {
      const row = rows.nth(i)
      const question = (await row.locator('dt').textContent()).trim()
      const value = (await row.locator('dd').first().innerText()).trim()
      details.push({ question, answers: value.split(/\r\n|\r|\n/).map((line) => line.trim()) })
    }

    return details
  }
}

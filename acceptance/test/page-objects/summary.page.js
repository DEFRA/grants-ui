export default class SummaryPage {
  constructor(page) {
    this.page = page
  }

  async answers() {
    const summaryAnswers = []

    const rows = this.page.locator('main .check-answers-summary > .govuk-summary-list > .govuk-summary-list__row')
    await rows.first().waitFor({ state: 'visible' })
    const rowCount = await rows.count()

    for (let i = 0; i < rowCount; i++) {
      const row = rows.nth(i)

      const question = (await row.locator('dt').textContent()).trim()
      const summaryAnswer = { question, answers: [] }
      summaryAnswers.push(summaryAnswer)

      const ul = row.locator('dd:nth-child(2) ul')
      if (await ul.isVisible().catch(() => false)) {
        const liItems = ul.locator('li')
        const count = await liItems.count()
        summaryAnswer.answers = []
        for (let j = 0; j < count; j++) {
          summaryAnswer.answers.push((await liItems.nth(j).textContent()).trim())
        }
      } else {
        const ddText = (await row.locator('dd:nth-child(2)').innerText()).trim()
        summaryAnswer.answers = ddText.split(/\r\n|\r|\n/).map((e) => e.trim())
      }
    }

    return summaryAnswers
  }

  async changeAnswerFor(question) {
    await this.page.locator(`//dt[contains(text(),'${question}')]/following-sibling::dd[2]/a`).click()
  }
}

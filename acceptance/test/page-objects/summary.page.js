export default class SummaryPage {
  constructor(page) {
    this.page = page
  }

  async answers() {
    const summaryAnswers = []

    // wait for the summary table to be present before iterating
    await this.page.locator('//h1/following-sibling::dl/div[1]').waitFor({ state: 'visible' })

    for (let i = 1; ; i++) {
      const row = this.page.locator(`//h1/following-sibling::dl/div[${i}]`)
      if (!(await row.isVisible().catch(() => false))) {
        break
      }

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

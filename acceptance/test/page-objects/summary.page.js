import SummaryAnswer from '../dto/summary-answer.js'

class SummaryPage {
  async answers(page) {
    const summaryAnswers = []

    await page.locator('//h1/following-sibling::dl/div[1]').waitFor({ state: 'visible' })

    for (let i = 1; ; i++) {
      const row = page.locator(`//h1/following-sibling::dl/div[${i}]`)
      if (!(await row.isVisible().catch(() => false))) {
        break
      }

      const question = (await page.locator(`//h1/following-sibling::dl/div[${i}]/dt`).textContent()).trim()
      const summaryAnswer = new SummaryAnswer(question)
      summaryAnswers.push(summaryAnswer)

      const hasList = await page
        .locator(`//h1/following-sibling::dl/div[${i}]/dd[1]/ul`)
        .isVisible()
        .catch(() => false)
      if (hasList) {
        const items = await page.locator(`//h1/following-sibling::dl/div[${i}]/dd[1]/ul/li`).all()
        summaryAnswer.answers = await Promise.all(items.map(async (e) => (await e.textContent()).trim()))
      } else {
        summaryAnswer.answers = await page.locator(`//h1/following-sibling::dl/div[${i}]/dd[1]`).evaluate((el) =>
          el.innerHTML
            .split(/<br\s*\/?>/i)
            .map((s) => s.replace(/<[^>]*>/g, '').trim())
            .filter((s) => s.length > 0)
        )
      }
    }

    return summaryAnswers
  }

  async changeAnswerFor(page, question) {
    await page.locator(`//dt[contains(text(),'${question}')]/following-sibling::dd[2]/a`).click()
  }
}

export default new SummaryPage()

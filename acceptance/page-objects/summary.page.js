import SummaryAnswer from '../dto/summary-answer.js'

class SummaryPage {
  async answers() {
    const summaryAnswers = []

    for (let i = 1; ; i++) {
      if (!(await $(`//h1/following-sibling::dl/div[${i}]`).isExisting())) {
        break
      }

      const question = (await $(`//h1/following-sibling::dl/div[${i}]/dt`).getText()).trim()
      const summaryAnswer = new SummaryAnswer(question)
      summaryAnswers.push(summaryAnswer)

      if (await $(`//h1/following-sibling::dl/div[${i}]/dd[1]/ul`).isExisting()) {
        // answers are in LI elements
        summaryAnswer.answers = await Promise.all(
          await $$(`//h1/following-sibling::dl/div[${i}]/dd[1]/ul/li`).map(async (e) => (await e.getText()).trim())
        )
      } else {
        summaryAnswer.answers = (await $(`//h1/following-sibling::dl/div[${i}]/dd[1]`).getText())
          .split(/\r\n|\r|\n/)
          .map((e) => e.trim())
      }
    }

    return summaryAnswers
  }

  async changeAnswerFor(question) {
    await $(`//dt[contains(text(),'${question}')]/following-sibling::dd[2]/a`).click()
  }
}

export default new SummaryPage()

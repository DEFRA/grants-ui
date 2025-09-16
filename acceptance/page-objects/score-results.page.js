import { $ } from '@wdio/globals'
import ScoreResult from '../dto/score-result.js'

class ScoreResultsPage {
  async changeAnswerFor(topic) {
    await $(
      `//h2/following-sibling::table/tbody/tr/td/strong[contains(text(),'${topic}')]/../following-sibling::td[3]/a`
    ).click()
  }

  async score() {
    return (await $('//h1/following-sibling::div/h2').getText()).trim()
  }

  async results() {
    const scoreResults = []

    for (let i = 1; ; i++) {
      if (!(await $(`//h2/following-sibling::table/tbody/tr[${i}]`).isExisting())) {
        break
      }

      const topic = await $(`//h2/following-sibling::table/tbody/tr[${i}]/td[1]/strong`).getText()
      const answers = await this.#answers(i)
      const score = await $(`//h2/following-sibling::table/tbody/tr[${i}]/td[3]/strong`).getText()
      const fundingPriorities = await $$(`//h2/following-sibling::table/tbody/tr[${i}]/td[3]/ul/li`).map(
        async (li) => await li.getText()
      )

      scoreResults.push(new ScoreResult(topic, answers, score, fundingPriorities))
    }

    return scoreResults
  }

  async #answers(rowIndex) {
    if (await $(`//h2/following-sibling::table/tbody/tr[${rowIndex}]/td[2]/ul`).isExisting()) {
      return await $$(`//h2/following-sibling::table/tbody/tr[${rowIndex}]/td[2]/ul/li`).map(
        async (li) => await li.getText()
      )
    } else {
      return [(await $(`//h2/following-sibling::table/tbody/tr[${rowIndex}]/td[2]`).getText()).trim()]
    }
  }
}

export default new ScoreResultsPage()

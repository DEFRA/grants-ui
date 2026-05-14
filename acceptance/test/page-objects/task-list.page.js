import Task from '../dto/task'
import TaskListApplicationStatus from '../dto/task-list-application-status'
import TaskListGroup from '../dto/task-list-group'

class TaskListPage {
  async applicationStatus() {
    const statusText = await $("//h2[contains(text(),'Application status')]/following-sibling::p[1]").getText()
    const [completed, total] = statusText.match(/\d+/g).map(Number)
    return new TaskListApplicationStatus(completed, total)
  }

  async groupsOfQuestions() {
    const groupHeadingElements = await $$(`//h2[@class='govuk-heading-m']`)
    return await Promise.all(
      await groupHeadingElements.map(async (e) => {
        return new TaskListGroup((await e.getText()).trim(), await this.#getQuestionsForGroup(e))
      })
    )
  }

  async selectTask(taskName) {
    await $(`//a[contains(text(),'${taskName}')]`).click()
  }

  async tasksWithoutQuestions() {
    const liElements = await $$(`//ul[@class='govuk-task-list']/li`)
    return await Promise.all(
      await liElements.map(async (li) => {
        const taskName = (await li.$('div.govuk-task-list__name-and-hint').getText()).trim()
        const status = (await li.$('div.govuk-task-list__status').getText()).trim()
        return new Task(taskName, status)
      })
    )
  }

  async #getQuestionsForGroup(groupHeadingElement) {
    const liElements = await groupHeadingElement.nextElement().$$('li')
    return await Promise.all(
      await liElements.map(async (li) => {
        const taskName = (await li.$('div.govuk-task-list__name-and-hint').getText()).trim()
        const status = (await li.$('div.govuk-task-list__status').getText()).trim()
        return new Task(taskName, status)
      })
    )
  }
}

export default new TaskListPage()

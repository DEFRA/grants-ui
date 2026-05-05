import Task from '../dto/task'
import TaskListApplicationStatus from '../dto/task-list-application-status'
import TaskListGroup from '../dto/task-list-group'

class TaskListPage {
  async applicationStatus() {
    const statusText = await $("//h2[contains(text(),'Application status')]/following-sibling::p[1]").getText()
    const [completed, total] = statusText.match(/\d+/g).map(Number)
    return new TaskListApplicationStatus(completed, total)
  }

  async groups() {
    const groupHeadingElements = await $$(`//h2[@class='govuk-heading-m']`)
    return await Promise.all(
      await groupHeadingElements.map(async (e) => {
        return new TaskListGroup((await e.getText()).trim(), await this.#getTasksForGroup(e))
      })
    )
  }

  async selectTask(taskName) {
    await $(`//h2[@class='govuk-heading-m']/following-sibling::ul/li/div/a[contains(text(),'${taskName}')]`).click()
  }

  async #getTasksForGroup(groupHeadingElement) {
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

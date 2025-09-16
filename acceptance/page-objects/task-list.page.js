import Task from '../dto/task.js'
import TaskListGroup from '../dto/task-list-group.js'

class TaskListPage {
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

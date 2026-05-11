import Task from '../dto/task.js'
import TaskListApplicationStatus from '../dto/task-list-application-status.js'
import TaskListGroup from '../dto/task-list-group.js'

class TaskListPage {
  async applicationStatus(page) {
    const statusText = await page
      .locator(`//h2[contains(text(),'Application status')]/following-sibling::p[1]`)
      .textContent()
    const [completed, total] = statusText.match(/\d+/g).map(Number)
    return new TaskListApplicationStatus(completed, total)
  }

  async groups(page) {
    const groupHeadingElements = await page.locator(`//h2[@class='govuk-heading-m']`).all()
    return await Promise.all(
      groupHeadingElements.map(async (e) => {
        return new TaskListGroup((await e.textContent()).trim(), await this.#getTasksForGroup(e))
      })
    )
  }

  async selectTask(page, taskName) {
    await page
      .locator(`//h2[@class='govuk-heading-m']/following-sibling::ul/li/div/a[contains(text(),'${taskName}')]`)
      .click()
  }

  async #getTasksForGroup(groupHeadingElement) {
    // The ul immediately follows the h2 in the DOM
    const liElements = await groupHeadingElement.locator('xpath=following-sibling::ul[1]/li').all()
    return await Promise.all(
      liElements.map(async (li) => {
        const taskName = (await li.locator('div.govuk-task-list__name-and-hint').textContent()).trim()
        const status = (await li.locator('div.govuk-task-list__status').textContent()).trim()
        return new Task(taskName, status)
      })
    )
  }
}

export default new TaskListPage()

export default class TaskListPage {
  constructor(page) {
    this.page = page
  }

  async applicationStatus() {
    const statusText = await this.page
      .locator("//h2[contains(text(),'Application status')]/following-sibling::p[1]")
      .textContent()
    const [completedTasks, totalTasks] = statusText.match(/\d+/g).map(Number)
    return { completedTasks, totalTasks }
  }

  async groupsOfQuestions() {
    const groupHeadings = this.page.locator("//h2[@class='govuk-heading-m']")
    const count = await groupHeadings.count()
    const groups = []
    for (let i = 0; i < count; i++) {
      const heading = groupHeadings.nth(i)
      const groupName = (await heading.textContent()).trim()
      const tasks = await this.#getQuestionsForGroup(heading)
      groups.push({ groupName, tasks })
    }
    return groups
  }

  async selectTask(taskName) {
    await this.page.locator(`//a[contains(text(),'${taskName}')]`).click()
  }

  async tasksWithoutQuestions() {
    const liElements = this.page.locator("//ul[@class='govuk-task-list']/li")
    const count = await liElements.count()
    const tasks = []
    for (let i = 0; i < count; i++) {
      const li = liElements.nth(i)
      const taskName = (await li.locator('div.govuk-task-list__name-and-hint').textContent()).trim()
      const status = (await li.locator('div.govuk-task-list__status').textContent()).trim()
      tasks.push({ taskName, status })
    }
    return tasks
  }

  async #getQuestionsForGroup(groupHeading) {
    const liElements = groupHeading.locator('xpath=following-sibling::*[1]//li')
    const count = await liElements.count()
    const tasks = []
    for (let i = 0; i < count; i++) {
      const li = liElements.nth(i)
      const taskName = (await li.locator('div.govuk-task-list__name-and-hint').textContent()).trim()
      const status = (await li.locator('div.govuk-task-list__status').textContent()).trim()
      tasks.push({ taskName, status })
    }
    return tasks
  }
}

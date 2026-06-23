import { When } from '@cucumber/cucumber'
import expect from '../support/expect.js'
import SummaryPage from '../page-objects/summary.page.js'
import TaskListPage from '../page-objects/task-list.page.js'
import AutocompleteField from '../page-objects/auto-complete.field.js'
import DatePartsField from '../page-objects/date-parts.field.js'
import MonthYearField from '../page-objects/month-year.field.js'

When('the user pauses', async function () {
  await this.page.pause()
})

When('(the user )clicks on {string}', async function (text) {
  await this.page.locator(`//*[contains(text(),'${text}')]`).click()
})

When('the user selects {string}', async function (text) {
  const element = this.page.getByRole('checkbox', { name: text }).or(this.page.getByRole('radio', { name: text }))
  if (!(await element.isChecked())) {
    await element.click()
    await expect(element).toBeChecked()
  }
})

When('the user selects {string} for {string}', async function (text, label) {
  await this.page.locator(`//label[contains(text(),'${label}')]/following::select`).selectOption({ label: text })
})

When('(the user )selects the following', async function (dataTable) {
  const checked = this.page.locator("//input[@type='checkbox'][@checked]")
  const count = await checked.count()
  for (let i = 0; i < count; i++) {
    await checked.nth(i).click()
  }
  for (const row of dataTable.raw()) {
    await this.page.getByLabel(row[0]).click()
  }
})

When('(the user )selects the first item', async function () {
  const checked = this.page.locator("//input[@type='checkbox'][@checked]")
  const count = await checked.count()
  for (let i = 0; i < count; i++) {
    await checked.nth(i).click()
  }
  await this.page.locator("//input[@type='checkbox']").first().click()
})

When('(the user )continues', async function () {
  await this.page.getByRole('button', { name: 'Continue' }).click()
})

When('(the user )confirms and continues', async function () {
  await this.page.getByRole('button', { name: 'Confirm and continue' }).click()
})

When('(the user )submits their form', async function () {
  await this.page.getByRole('button', { name: 'Send' }).click()
})

When('(the user )decides to save and return to their application later', async function () {
  await this.page.getByRole('button', { name: 'Save and return' }).click()
})

When('(the user )navigates backward', async function () {
  await this.page.locator("//a[@class='govuk-back-link']").click()
})

When('(the user )enters {string} for {string}', async function (text, label) {
  await this.page.locator(`//label[contains(text(),'${label}')]/following::input[1]`).fill(text)
})

When('(the user )enters {string} for label heading {string}', async function (text, label) {
  await this.page.locator(`//label[contains(text(),'${label}')]/ancestor::div[1]//input`).fill(text)
})

When('(the user )enters {string} for MultilineTextField {string}', async function (text, label) {
  await this.page.locator(`//label[contains(text(),'${label}')]/following::textarea`).fill(text)
})

When('the user enters the following', async function (dataTable) {
  for (const row of dataTable.hashes()) {
    const element = this.page.locator(
      `//label[contains(text(),'${row.FIELD}')]/following::*[name()='input' or name()='select' or name()='textarea'][1]`
    )
    const tag = await element.evaluate((el) => el.tagName.toLowerCase())
    if (tag === 'select') {
      await element.selectOption({ label: row.VALUE })
    } else {
      await element.fill(row.VALUE)
    }
  }
})

When('(the user )confirms and sends', async function () {
  await this.page.locator("//button[contains(text(),'Confirm and send')]").click()
})

When('(the user )selects task {string}', async function (taskName) {
  const taskList = new TaskListPage(this.page)
  await taskList.selectTask(taskName)
})

When('(the user )chooses to change their summary answer to question {string}', async function (question) {
  const summary = new SummaryPage(this.page)
  await summary.changeAnswerFor(question)
})

When('(the user )selects {string} for AutocompleteField {string}', async function (value, label) {
  const autocompleteField = new AutocompleteField(this.page, label)
  await autocompleteField.clear()
  await autocompleteField.select(value)
})

When('(the user )enters the date in a week for DatePartsField {string}', async function (id) {
  const date = new Date()
  date.setDate(date.getDate() + 7)
  const datePartsField = new DatePartsField(this.page, id)
  await datePartsField.setDateUTC(date)
})

When(
  '(the user )enters month {string} and year {string} for MonthYearField {string}',
  async function (month, year, id) {
    const monthYearField = new MonthYearField(this.page, id)
    await monthYearField.set(month, year)
  }
)

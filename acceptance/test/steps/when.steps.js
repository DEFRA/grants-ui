import { When } from '@cucumber/cucumber'
import SummaryPage from '../page-objects/summary.page.js'
import TaskListPage from '../page-objects/task-list.page.js'
import AutocompleteField from '../page-objects/auto-complete.field.js'
import DatePartsField from '../page-objects/date-parts.field.js'
import MonthYearField from '../page-objects/month-year.field.js'

When('(the user )clicks on {string}', async function (text) {
  await this.page.locator(`//*[contains(text(),'${text}')]`).click()
})

When('the user selects {string}', async function (text) {
  const element = this.page.getByLabel(text, { exact: false })
  const checked = await element.isChecked()
  if (!checked) {
    await element.click()
  }
})

When('the user selects {string} for {string}', async function (text, label) {
  await this.page.locator(`//label[contains(text(),'${label}')]/following::select`).selectOption({ label: text })
})

When('(the user )selects the following', async function (dataTable) {
  const checked = await this.page.locator(`//input[@type='checkbox' and @checked]`).all()
  for (const el of checked) {
    await el.click()
  }
  for (const row of dataTable.raw()) {
    await this.page.getByLabel(row[0], { exact: false }).click()
  }
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
  await this.page.locator(`//a[@class='govuk-back-link']`).click()
})

When('(the user )enters {string} for {string}', async (text, label) => {
  await $(`//label[contains(text(),'${label}')]/following::input[1]`).setValue(text)
})

When('(the user )enters {string} for label heading {string}', async function (text, label) {
  await this.page.locator(`//label[contains(text(),'${label}')]/ancestor::div[1]//input`).fill(text)
})

When('(the user )enters {string} for MultilineTextField {string}', async function (text, label) {
  await this.page.locator(`//label[contains(text(),'${label}')]/following::textarea`).fill(text)
})

When('the user enters the following', async function (dataTable) {
  for (const row of dataTable.hashes()) {
    const element = await $(
      `//label[contains(text(),'${row.FIELD}')]/following::*[name()='input' or name()='select'][1]`
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
  await this.page.locator(`//button[contains(text(),'Confirm and send')]`).click()
})

When('(the user )selects task {string}', async function (taskName) {
  await TaskListPage.selectTask(this.page, taskName)
})

When('(the user )chooses to change their summary answer to question {string}', async function (question) {
  await SummaryPage.changeAnswerFor(this.page, question)
})

When('(the user )selects {string} for AutocompleteField {string}', async function (value, label) {
  const autocompleteField = new AutocompleteField(label)
  await autocompleteField.clear(this.page)
  await autocompleteField.select(this.page, value)
})

When('(the user )enters the date in a week for DatePartsField {string}', async function (id) {
  const date = new Date()
  date.setDate(date.getDate() + 7)
  const datePartsField = new DatePartsField(id)
  await datePartsField.setDateUTC(this.page, date)
})

When(
  '(the user )enters month {string} and year {string} for MonthYearField {string}',
  async function (month, year, id) {
    const monthYearField = new MonthYearField(id)
    await monthYearField.set(this.page, month, year)
  }
)

When('(the user )waits for {int} seconds', async function (waitSeconds) {
  await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000))
})

import { When } from '@wdio/cucumber-framework'
import ScoreResultsPage from '../page-objects/score-results.page.js'
import SummaryPage from '../page-objects/summary.page.js'
import TaskListPage from '../page-objects/task-list.page.js'
import TaskSummaryPage from '../page-objects/task-summary.page.js'
import AutocompleteField from '../page-objects/auto-complete.field.js'
import DatePartsField from '../page-objects/date-parts.field.js'
import MonthYearField from '../page-objects/month-year.field.js'

When('(the user )clicks on {string}', async (text) => {
  await $(`//*[contains(text(),'${text}')]`).click()
})

When('the user selects {string}', async (text) => {
  const element = await $(`aria/${text}`)
  if (!(await element.isSelected())) {
    await element.click()
  }
})

When('the user selects {string} for {string}', async (text, label) => {
  await $(`//label[contains(text(),'${label}')]/following::select`).selectByVisibleText(text)
})

When('(the user )selects the following', async (dataTable) => {
  await Promise.all(await $$(`//input[@type='checkbox' and @checked]`).map(async (e) => await e.click()))
  for (const row of dataTable.raw()) {
    await $(`aria/${row[0]}`).click()
  }
})

When('(the user )continues', async () => {
  await $(`aria/Continue`).click()
})

When('(the user )confirms and continues', async () => {
  await $(`aria/Confirm and continue`).click()
})

When('(the user )submits their form', async () => {
  await $(`aria/Send`).click()
})

When('(the user )decides to save and return to their application later', async () => {
  await $(`aria/Save and return`).click()
})

When('(the user )navigates backward', async () => {
  await $(`//a[@class='govuk-back-link']`).click()
})

When('(the user )enters {string} for {string}', async (text, label) => {
  await $(`//label[contains(text(),'${label}')]/following::input[@type='text']`).setValue(text)
})

When('(the user )enters {string} for MultilineTextField {string}', async (text, label) => {
  await $(`//label[contains(text(),'${label}')]/following::textarea`).setValue(text)
})

When('the user enters the following', async (dataTable) => {
  for (const row of dataTable.hashes()) {
    const element = await $(
      `//label[contains(text(),'${row.FIELD}')]/following::*[name()='input' or name()='select'][1]`
    )
    const tag = await element.getTagName()
    if (tag === 'select') {
      await element.selectByVisibleText(row.VALUE)
    } else {
      await element.setValue(row.VALUE)
    }
  }
})

When('(the user )confirms and sends', async () => {
  await $(`//button[contains(text(),'Confirm and send')]`).click()
})

When('(the user )selects task {string}', async (taskName) => {
  await TaskListPage.selectTask(taskName)
})

When('(the user )chooses to change their {string} scoring answer', async (topic) => {
  await ScoreResultsPage.changeAnswerFor(topic)
})

When('(the user )chooses to change their sub-task answer to question {string}', async (question) => {
  await TaskSummaryPage.changeAnswerFor(question)
})

When('(the user )chooses to change their summary answer to question {string}', async (question) => {
  await SummaryPage.changeAnswerFor(question)
})

When('(the user )selects {string} for AutocompleteField {string}', async (value, label) => {
  const autocompleteField = new AutocompleteField(label)
  await autocompleteField.clear()
  await autocompleteField.select(value)
})

When('(the user )enters the date in a week for DatePartsField {string}', async (id) => {
  const date = new Date()
  date.setDate(date.getDate() + 7)
  const datePartsField = new DatePartsField(id)
  await datePartsField.setDateUTC(date)
})

When('(the user )enters month {string} and year {string} for MonthYearField {string}', async (month, year, id) => {
  const monthYearField = new MonthYearField(id)
  await monthYearField.set(month, year)
})

When('(the user )waits for {int} seconds', async (waitSeconds) => {
  await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000))
})

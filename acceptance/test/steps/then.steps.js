import { Then } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import { analyzeAccessibility } from '../utils/accessibility.js'
import { pollForSuccess } from '../utils/polling.js'
import { getReferenceNumberStore } from '../utils/reference-number-store.js'
import { transformStepArgument } from '../utils/step-argument-transformation.js'
import AutocompleteField from '../page-objects/auto-complete.field.js'
import DefraAccountBar from '../page-objects/defra-account-bar.js'
import SummaryAnswer from '../dto/summary-answer.js'
import SummaryPage from '../page-objects/summary.page.js'
import PrintSubmittedApplicationPage from '../page-objects/print-submitted-application.page.js'
import Task from '../dto/task.js'
import TaskListGroup from '../dto/task-list-group.js'
import TaskListPage from '../page-objects/task-list.page.js'

Then('a new tab should be opened at URL {string} and closed by the user', async function (expectedPath) {
  const newPage = await this.context.waitForEvent('page')
  await newPage.waitForLoadState()
  expect(newPage.url()).toContain(expectedPath)
  await newPage.close()
})

Then('the footer should contain the following links', async function (dataTable) {
  for (const row of dataTable.hashes()) {
    const linkText = row.TEXT
    const url = row.URL
    const link = this.page.locator(`//footer//a[contains(text(),'${linkText}')]`)
    await expect(link).toBeVisible()
    if (url) {
      await expect(link).toHaveAttribute('href', url)
    }
  }
})

Then('the page is analyzed for accessibility', async function () {
  await analyzeAccessibility(this.page)
})

Then('(the user )should see heading {string}', async function (text) {
  if (text.indexOf("'") > -1) {
    text = text.substring(0, text.indexOf("'"))
  }
  await expect(this.page.locator(`//h1[contains(text(),'${text}')]`)).toBeVisible()
})

Then('(the user )should see label heading {string}', async function (text) {
  if (text.indexOf("'") > -1) {
    text = text.substring(0, text.indexOf("'"))
  }
  await expect(this.page.locator(`//h1/label[contains(text(),'${text}')]`)).toBeVisible()
})

Then('(the user )should see banner {string}', async function (text) {
  if (text.indexOf("'") > -1) {
    text = text.substring(0, text.indexOf("'"))
  }
  await expect(this.page.locator(`//span[@class='govuk-service-navigation__service-name']/a`)).toHaveText(text)
})

Then('(the user )should see task title {string}', async function (text) {
  if (text.indexOf("'") > -1) {
    text = text.substring(0, text.indexOf("'"))
  }
  await expect(this.page.locator(`//h2[@id='section-title']`)).toHaveText(text)
})

Then('(the user )should (still )be (back )at URL {string}', async function (expectedPath) {
  await expect(this.page).toHaveURL(new RegExp(expectedPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
})

Then('(the user )should see the following answers', async function (dataTable) {
  const expectedAnswers = []
  let summaryAnswer = {}

  for (const row of dataTable.hashes()) {
    const question = row.QUESTION
    const answer = transformStepArgument(row.ANSWER, this)

    if (question) {
      summaryAnswer = new SummaryAnswer(question)
      expectedAnswers.push(summaryAnswer)
    }

    if (answer) {
      summaryAnswer.answers.push(answer)
    }
  }

  const actualAnswers = await SummaryPage.answers(this.page)
  expect(actualAnswers).toEqual(expectedAnswers)
})

Then('(the user )should see the following submitted application details', async function (dataTable) {
  const [referenceNumber, applicantDetails, submittedAnswers] = await Promise.all([
    PrintSubmittedApplicationPage.referenceNumber(this.page),
    PrintSubmittedApplicationPage.applicantDetails(this.page),
    PrintSubmittedApplicationPage.submittedAnswers(this.page)
  ])

  let processingApplicantDetails = false
  let processingSubmittedAnswers = false

  for (const row of dataTable.raw()) {
    const [key, value] = row

    if (key === 'Application number') {
      expect(referenceNumber).toEqual(transformStepArgument(value, this))
      continue
    }

    if (key === 'Applicant details') {
      processingApplicantDetails = true
      processingSubmittedAnswers = false
      continue
    }

    if (key === 'Submitted answers') {
      processingApplicantDetails = false
      processingSubmittedAnswers = true
      continue
    }

    if (processingApplicantDetails) {
      const match = applicantDetails.find((a) => a.title === key)
      expect(match?.value).toBeTruthy()
      continue
    }

    if (processingSubmittedAnswers) {
      const match = submittedAnswers.find((a) => a.question === key)
      expect(match?.answer).toEqual(transformStepArgument(value, this))
    }
  }
})

Then('(the user )should see the following configurable content', async function (dataTable) {
  for (const [text] of dataTable.rows()) {
    const hasContent = await PrintSubmittedApplicationPage.hasConfigurableContent(this.page, text)
    expect(hasContent).toBe(true)
  }
})

Then('(the user )should see error {string}', async function (text) {
  await expect(this.page.locator(`//div[@class="govuk-error-summary"]//a[contains(text(),'${text}')]`)).toBeVisible()
})

Then('(the user )should see the following errors', async function (dataTable) {
  const expectedErrors = dataTable.raw().map((row) => row[0])
  let actualErrors = []

  await pollForSuccess(async () => {
    const elements = await this.page.locator('//div[@class="govuk-error-summary"]//a').all()
    actualErrors = await Promise.all(elements.map((e) => e.textContent().then((t) => t.trim())))
    return actualErrors.length === expectedErrors.length
  })

  expect(actualErrors).toEqual(expectedErrors)
})

Then('(the user )should see a/an {string} reference number for their application', async function (prefix) {
  const locator = this.page.locator('//h1/following-sibling::div[1]/strong')
  await expect(locator).toContainText(prefix)
  getReferenceNumberStore(this).push(await locator.textContent().then((t) => t.trim()))
})

Then('(the user )should see body {string}', async function (text) {
  await expect(this.page.locator(`//p[@class='govuk-body' and contains(text(),'${text}')]`)).toBeVisible()
})

Then('(the user )should see hint {string}', async function (text) {
  await expect(this.page.locator(`//div[@class="govuk-hint" and contains(text(),'${text}')]`)).toBeVisible()
})

Then('(the user )should see warning {string}', async function (text) {
  await expect(
    this.page.locator(`//div[@class='govuk-warning-text']//strong[text()[contains(.,'${text}')]]`)
  ).toBeVisible()
})

Then(
  '(the user )should see the following task list with {int} of {int} tasks completed',
  async function (completedTasks, totalTasks, dataTable) {
    const expectedGroups = []
    let group = null

    for (const row of dataTable.raw()) {
      if (!row[0]) {
        continue
      }

      if (!row[1]) {
        group = new TaskListGroup(row[0], [])
        expectedGroups.push(group)
      } else {
        group.tasks.push(new Task(row[0], row[1]))
      }
    }

    const applicationStatus = await TaskListPage.applicationStatus(this.page)
    expect(applicationStatus.completedTasks).toEqual(completedTasks)
    expect(applicationStatus.totalTasks).toEqual(totalTasks)

    const actualGroups = await TaskListPage.groups(this.page)
    expect(actualGroups).toEqual(expectedGroups)
  }
)

Then('(the user )should see {string} as the selected radio option', async function (option) {
  await expect(
    this.page.locator(`//label[contains(text(),'${option}')]/preceding-sibling::input[@type='radio']`)
  ).toBeChecked()
})

Then('(the user )should see {string} selected for AutocompleteField {string}', async function (expectedOption, label) {
  const autocompleteField = new AutocompleteField(label)
  const actualOption = await autocompleteField.getSelectedOption(this.page)
  expect(actualOption).toEqual(expectedOption)
})

Then('(the user )should see button {string}', async function (text) {
  await expect(this.page.locator(`//button[contains(text(),'${text}')]`)).toBeVisible()
})

Then('(the user )should see SBI {string} as the logged in organisation', async function (expectedSbi) {
  const actualSbi = await DefraAccountBar.sbi(this.page)
  expect(actualSbi).toEqual(expectedSbi)
})

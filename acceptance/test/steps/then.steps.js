import { Then } from '@cucumber/cucumber'
import expect from '../support/expect.js'
import { analyzeAccessibility } from '../utils/accessibility.js'
import referenceNumbers from '../utils/reference-number-store.js'
import { transformStepArgument } from '../utils/step-argument-transformation.js'
import AutocompleteField from '../page-objects/auto-complete.field.js'
import DefraAccountBar from '../page-objects/defra-account-bar.js'
import SummaryPage from '../page-objects/summary.page.js'
import PrintSubmittedApplicationPage from '../page-objects/print-submitted-application.page.js'
import TaskListPage from '../page-objects/task-list.page.js'

Then('a new tab should be opened at URL {string} and closed by the user', async function (expectedPath) {
  const newPage = await this.context.waitForEvent('page')
  await newPage.waitForLoadState()
  await expect(newPage).toHaveURL(new RegExp(expectedPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  await newPage.close()
})

Then('no option should be selected', async function () {
  const inputs = this.page.locator('//input[@checked]')
  await expect(inputs).toHaveCount(0)
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
  const truncated = text.indexOf("'") > -1 ? text.substring(0, text.indexOf("'")) : text
  await expect(this.page.locator(`//h1[contains(text(),'${truncated}')]`)).toBeVisible()
})

Then('(the user )should see label heading {string}', async function (text) {
  const truncated = text.indexOf("'") > -1 ? text.substring(0, text.indexOf("'")) : text
  await expect(this.page.locator(`//h1/label[contains(text(),'${truncated}')]`)).toBeVisible()
})

Then('(the user )should see banner {string}', async function (text) {
  const truncated = text.indexOf("'") > -1 ? text.substring(0, text.indexOf("'")) : text
  await expect(this.page.locator("//span[@class='govuk-service-navigation__service-name']/a")).toHaveText(truncated)
})

Then('(the user )should see task title {string}', async function (text) {
  const truncated = text.indexOf("'") > -1 ? text.substring(0, text.indexOf("'")) : text
  await expect(this.page.locator("//h2[@id='section-title']")).toHaveText(truncated)
})

Then('(the user )should (still )be (back )at URL {string}', async function (expectedPath) {
  await expect(this.page).toHaveURL(new RegExp(expectedPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
})

Then('(the user )should see the following answers', async function (dataTable) {
  const expectedAnswers = []
  let summaryAnswer = {}

  for (const row of dataTable.hashes()) {
    const question = row.QUESTION
    const answer = transformStepArgument(row.ANSWER)

    if (question) {
      summaryAnswer = { question, answers: [] }
      expectedAnswers.push(summaryAnswer)
    }

    if (answer) {
      summaryAnswer.answers.push(answer)
    }
  }

  const summaryPage = new SummaryPage(this.page)
  const actualAnswers = await summaryPage.answers()
  expect(actualAnswers).toEqual(expectedAnswers)
})

Then('(the user )should see the following submitted application details', async function (dataTable) {
  const printPage = new PrintSubmittedApplicationPage(this.page)
  const [referenceNumber, applicantDetails, submittedAnswers] = await Promise.all([
    printPage.referenceNumber(),
    printPage.applicantDetails(),
    printPage.submittedAnswers()
  ])

  let processingApplicantDetails = false
  let processingSubmittedAnswers = false

  for (const row of dataTable.raw()) {
    const [key, value] = row

    if (key === 'Application number') {
      expect(referenceNumber).toEqual(transformStepArgument(value))
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
      expect(match?.answer).toEqual(transformStepArgument(value))
    }
  }
})

Then('(the user )should see the following configurable content', async function (dataTable) {
  const printPage = new PrintSubmittedApplicationPage(this.page)
  for (const [text] of dataTable.rows()) {
    const hasContent = await printPage.hasConfigurableContent(text)
    expect(hasContent).toBe(true)
  }
})

Then('(the user )should see error {string}', async function (text) {
  await expect(this.page.locator(`//div[@class="govuk-error-summary"]//a[contains(text(),'${text}')]`)).toBeVisible()
})

Then('(the user )should see the following errors', async function (dataTable) {
  const expectedErrors = dataTable.raw().map((row) => row[0])
  const links = this.page.locator('//div[@class="govuk-error-summary"]//a')
  await expect(links).toHaveCount(expectedErrors.length)
  expect(await links.allTextContents()).toEqual(expectedErrors)
})

Then('(the user )should see a/an {string} reference number for their application', async function (prefix) {
  const selector = this.page.locator('//h1/following-sibling::div[1]/strong')
  await expect(selector).toContainText(prefix)
  referenceNumbers.push(await selector.textContent())
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
  '(the user )should see the following task list with questions with {int} of {int} task pages completed',
  async function (completedTasks, totalTasks, dataTable) {
    const expectedGroupOfQuestions = []
    let group = null

    for (const row of dataTable.raw()) {
      if (!row[0]) {
        continue
      }

      if (!row[1]) {
        group = { groupName: row[0], tasks: [] }
        expectedGroupOfQuestions.push(group)
      } else {
        group.tasks.push({ taskName: row[0], status: row[1] })
      }
    }

    const taskList = new TaskListPage(this.page)
    const applicationStatus = await taskList.applicationStatus()
    expect(applicationStatus.completedTasks).toEqual(completedTasks)
    expect(applicationStatus.totalTasks).toEqual(totalTasks)

    const actualGroupsOfQuestions = await taskList.groupsOfQuestions()
    expect(actualGroupsOfQuestions).toEqual(expectedGroupOfQuestions)
  }
)

Then(
  '(the user )should see the following task list without questions with {int} of {int} task pages completed',
  async function (completedTasks, totalTasks, dataTable) {
    const expectedTasks = []

    for (const row of dataTable.raw()) {
      expectedTasks.push({ taskName: row[0], status: row[1] })
    }

    const taskList = new TaskListPage(this.page)
    const applicationStatus = await taskList.applicationStatus()
    expect(applicationStatus.completedTasks).toEqual(completedTasks)
    expect(applicationStatus.totalTasks).toEqual(totalTasks)

    const actualTasks = await taskList.tasksWithoutQuestions()
    expect(actualTasks).toEqual(expectedTasks)
  }
)

Then('(the user )should see {string} as the selected radio option', async function (option) {
  await expect(
    this.page.locator(`//label[contains(text(),'${option}')]/preceding-sibling::input[@type='radio']`)
  ).toBeChecked()
})

Then('(the user )should see {string} selected for AutocompleteField {string}', async function (expectedOption, label) {
  const autocompleteField = new AutocompleteField(this.page, label)
  const actualOption = await autocompleteField.getSelectedOption()
  expect(actualOption).toEqual(expectedOption)
})

Then('(the user )should see button {string}', async function (text) {
  await expect(this.page.locator(`//button[contains(text(),'${text}')]`)).toBeVisible()
})

Then('(the user )should see SBI {string} as the logged in organisation', async function (expectedSbi) {
  const accountBar = new DefraAccountBar(this.page)
  const actualSbi = await accountBar.sbi()
  expect(actualSbi).toEqual(expectedSbi)
})

Then('(the user )should see the following organisation address', async function (dataTable) {
  const label = 'Organisation address'
  const expectedLines = dataTable.raw().map((row) => row[0].trim())
  const valueCell = this.page.locator(`//dt[normalize-space()='${label}']/following-sibling::dd[1]`)
  await expect(valueCell).toBeVisible()
  const actualText = (await valueCell.innerText()).trim()
  const actualLines = actualText
    .split(/\r\n|\r|\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  expect(actualLines).toEqual(expectedLines)
})

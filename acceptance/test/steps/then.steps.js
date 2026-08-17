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
  await expect(this.page.locator(`//h1[contains(normalize-space(.),'${truncated}')]`)).toBeVisible()
})

Then('(the user )should see label heading {string}', async function (text) {
  const truncated = text.indexOf("'") > -1 ? text.substring(0, text.indexOf("'")) : text
  await expect(this.page.locator(`//h1/label[contains(text(),'${truncated}')]`)).toBeVisible()
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

Then('(the user )should see {string} in the selected parcel summary', async function (parcelId) {
  await expect(this.page.locator('#parcel-selection-summary')).toHaveText(`Selected: ${parcelId}`)
})

Then('(the user )should see a/an {string} reference number for their application', async function (prefix) {
  const selector = this.page.locator('//h1/following-sibling::div[1]/strong')
  await expect(selector).toContainText(prefix)
  referenceNumbers.push(await selector.textContent())
})

Then('(the user )should see a reference number for their application', async function () {
  const selector = this.page.locator('//h1/following-sibling::div[1]/strong')
  await expect(selector).toBeVisible()
  referenceNumbers.push(await selector.textContent())
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

Then('(the user )should see the text {string}', async function (text) {
  await expect(this.page.locator('main')).toContainText(text)
})

const CURRENCY_PATTERN = /^£[\d,]+\.\d{2}$/
// Action rows read "44.0000 ha (£14,652.00)"; total rows carry the amount alone.
const AMOUNT_IN_VALUE = /£[\d,]+\.\d{2}/
const PARCEL_TOTAL_LABEL = 'Yearly payment for this parcel'
const APPLICATION_TOTAL_LABEL = 'Total yearly payment'

const toPence = (text) => Math.round(Number(String(text).replace(/[£,\s]/g, '')) * 100)

/**
 * Reads the row header and the money value from the second cell of a GOV.UK
 * table row, asserting that the row really does carry a currency amount.
 */
const rowAmount = async (row, context) => {
  const label = (await row.locator('.govuk-table__header').innerText()).trim()
  const value = (await row.locator('.govuk-table__cell').first().innerText()).trim()
  const amount = value.match(AMOUNT_IN_VALUE)?.[0] ?? value

  expect(amount, `${context} row "${label}" has no payment value`).toMatch(CURRENCY_PATTERN)

  return { label, pence: toPence(amount) }
}

// Deliberately does NOT assert that the application total equals the parcel
// totals plus the agreement-level rows: `annualTotalPence` is the authoritative
// figure from the Land Grants API and its composition is not a contract this
// suite can pin. What is asserted is that every displayed amount is a real
// currency value and that each parcel total matches the rows it is built from,
// which is how the view model computes it.
Then('(the user )should see a populated land and actions payment summary', async function () {
  const sections = this.page.locator('.land-parcel-summary')
  const sectionCount = await sections.count()
  expect(sectionCount, 'expected at least one land parcel section').toBeGreaterThan(0)

  let parcelSections = 0
  let parcelActionRows = 0

  for (let i = 0; i < sectionCount; i++) {
    const section = sections.nth(i)
    const title = (await section.locator('h2').innerText()).trim()
    const context = `section "${title}"`
    const rows = section.locator('.govuk-table__row')
    const rowCount = await rows.count()
    expect(rowCount, `${context} rendered no rows`).toBeGreaterThan(0)

    // Every row in the block must price something, agreement-level rows
    // included; only the parcel total is singled out here.
    let parcelTotalPence = null
    for (let row = 0; row < rowCount; row++) {
      const { label, pence } = await rowAmount(rows.nth(row), context)
      if (label === PARCEL_TOTAL_LABEL) {
        parcelTotalPence = pence
      }
    }

    if (!title.startsWith('Land parcel')) {
      continue
    }
    parcelSections += 1

    // Summed from the action rows alone: the total row and any non-action row
    // must not feed the figure the total is checked against.
    const actionRows = section.locator('.land-parcel-summary__action-row')
    const actionRowCount = await actionRows.count()
    let actionSumPence = 0
    for (let row = 0; row < actionRowCount; row++) {
      actionSumPence += (await rowAmount(actionRows.nth(row), context)).pence
      parcelActionRows += 1
    }

    expect(parcelTotalPence, `${context} has no total row`).not.toBeNull()
    expect(parcelTotalPence, `${context} total does not match its action rows`).toEqual(actionSumPence)
  }

  // Counted from parcel sections only: an agreement-level row must never stand
  // in for a priced land action, or a summary showing no parcel actions at all
  // would pass.
  expect(parcelSections, 'no land parcel sections were rendered').toBeGreaterThan(0)
  expect(parcelActionRows, 'no priced land action rows were rendered').toBeGreaterThan(0)

  // The application total sits in its own table outside the parcel sections, so
  // it is located from the page by its exact row header.
  const applicationTotalRow = this.page.locator('.govuk-table__row', {
    has: this.page.locator(`th.govuk-table__header:text-is("${APPLICATION_TOTAL_LABEL}")`)
  })
  const applicationTotal = (await applicationTotalRow.locator('.govuk-table__cell').first().innerText()).trim()
  expect(applicationTotal, 'application total is not a currency value').toMatch(CURRENCY_PATTERN)
  expect(toPence(applicationTotal), 'application total is zero').toBeGreaterThan(0)
})

Then('(the user )should see {int} land parcel section(s)', async function (expected) {
  const titles = this.page.locator('.land-parcel-summary h2')
  const count = await titles.count()
  let parcelSections = 0

  for (let i = 0; i < count; i++) {
    if ((await titles.nth(i).innerText()).trim().startsWith('Land parcel')) {
      parcelSections += 1
    }
  }

  expect(parcelSections).toEqual(expected)
})

Then('(the user )should see a notification banner', async function () {
  await expect(this.page.locator('div.govuk-notification-banner')).toBeVisible()
})

Then('(the user )should see full GOV.UK branding as a public beta service', async function () {
  await expect(this.page.locator('.govuk-header')).toBeVisible()
  await expect(this.page.locator('.defra-brand-bar')).toHaveCount(0)
  await expect(this.page.locator('html')).toHaveClass(/govuk-template--rebranded/)
})

Then('(the user )should not see a notification banner', async function () {
  await expect(this.page.locator('div.govuk-notification-banner')).not.toBeVisible()
})

Then('(the user )should see a phase banner feedback link', async function () {
  const link = this.page.locator('.govuk-phase-banner a.govuk-link', { hasText: 'feedback' })
  await expect(link).toBeVisible()
  const href = await link.getAttribute('href')
  const params = new URL(href).searchParams
  expect(params.get('grant')).toBeTruthy()
  expect(params.get('url')).toBeTruthy()
  expect(params.get('journey')).toEqual('application-inprogress')
})

Then('(the user )should see a confirmation page feedback link', async function () {
  const link = this.page.locator('a.govuk-link', { hasText: 'Give feedback on this service' })
  await expect(link).toBeVisible()
  const href = await link.getAttribute('href')
  const params = new URL(href).searchParams
  expect(params.get('grant')).toBeTruthy()
  expect(params.get('url')).toBeTruthy()
  expect(params.get('journey')).toEqual('application-submitted')
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

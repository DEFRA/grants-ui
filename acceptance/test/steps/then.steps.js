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
const PARCEL_TOTAL_LABEL = 'Total yearly payment for land parcel'

const toPence = (text) => Math.round(Number(String(text).replace(/[£,\s]/g, '')) * 100)

// Deliberately does NOT assert that the application total equals the parcel
// totals plus the agreement-level rows: `annualTotalPence` is the authoritative
// figure from the Land Grants API and its composition is not a contract this
// suite can pin. What is asserted is that every displayed amount is a real
// currency value and that each parcel total matches the rows it is built from,
// which is how the view model computes it.
Then('(the user )should see a populated land and actions payment summary', async function () {
  const cards = this.page.locator('.govuk-summary-card')
  const cardCount = await cards.count()
  expect(cardCount, 'expected at least one summary card').toBeGreaterThan(0)

  let parcelCards = 0
  let parcelActionRows = 0

  for (let i = 0; i < cardCount; i++) {
    const card = cards.nth(i)
    const title = (await card.locator('.govuk-summary-card__title').innerText()).trim()
    const rows = card.locator('tbody tr')
    const rowCount = await rows.count()
    expect(rowCount, `card "${title}" rendered no rows`).toBeGreaterThan(0)

    const isParcelCard = title.startsWith('Land parcel')
    const amountIndex = isParcelCard ? 2 : 1
    let actionSumPence = 0
    let parcelTotalPence = null

    for (let row = 0; row < rowCount; row++) {
      const cells = rows.nth(row).locator('th, td')
      const label = (await cells.nth(0).innerText()).trim()
      const amount = (await cells.nth(amountIndex).innerText()).trim()

      expect(amount, `card "${title}" row "${label}" has no payment value`).toMatch(CURRENCY_PATTERN)

      if (label === PARCEL_TOTAL_LABEL) {
        parcelTotalPence = toPence(amount)
      } else if (isParcelCard) {
        actionSumPence += toPence(amount)
        parcelActionRows += 1
      }
    }

    if (isParcelCard) {
      parcelCards += 1
      expect(parcelTotalPence, `card "${title}" has no total row`).not.toBeNull()
      expect(parcelTotalPence, `card "${title}" total does not match its action rows`).toEqual(actionSumPence)
    }
  }

  // Counted from parcel cards only: an agreement-level row must never stand in
  // for a priced land action, or a summary showing no parcel actions at all
  // would pass.
  expect(parcelCards, 'no land parcel cards were rendered').toBeGreaterThan(0)
  expect(parcelActionRows, 'no priced land action rows were rendered').toBeGreaterThan(0)

  const applicationTotalRow = this.page.locator('.govuk-summary-list__row', {
    hasText: 'Total yearly payment for application'
  })
  const applicationTotal = (await applicationTotalRow.locator('.govuk-summary-list__value').innerText()).trim()
  expect(applicationTotal, 'application total is not a currency value').toMatch(CURRENCY_PATTERN)
  expect(toPence(applicationTotal), 'application total is zero').toBeGreaterThan(0)
})

Then('(the user )should see {int} land parcel card(s)', async function (expected) {
  const titles = this.page.locator('.govuk-summary-card__title')
  const count = await titles.count()
  let parcelCards = 0

  for (let i = 0; i < count; i++) {
    if ((await titles.nth(i).innerText()).trim().startsWith('Land parcel')) {
      parcelCards += 1
    }
  }

  expect(parcelCards).toEqual(expected)
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

import { Given } from '@cucumber/cucumber'
import expect from '../support/expect.js'
import DefraAccountBar from '../page-objects/defra-account-bar.js'

Given('(the user )navigates to {string}', async function (path) {
  await this.page.goto(path)
})

Given('(the user )logs in as CRN {string}', async function (crn) {
  await this.page.locator("//input[@id='crn']").fill(crn)
  await this.page.locator("//input[@id='password']").fill(process.env.DEFRA_ID_USER_PASSWORD)
  await this.page.locator("//button[@type='submit']").click()
  // wait for the stub's login form to disappear, indicating the sign-in has been processed
  await expect(this.page.locator("//input[@id='crn']")).not.toBeVisible()
})

Given('(the user )signs out of Defra ID', async function () {
  const accountBar = new DefraAccountBar(this.page)
  await accountBar.signOut()
  await this.page.waitForLoadState('networkidle')
  await expect(this.page.locator("//h1[contains(text(),'Sign into your Defra account')]")).toBeVisible()
})

Given('(the user )selects SBI {string}', async function (sbi) {
  await this.page.locator(`//label[contains(text(),'SBI ${sbi}')]/preceding-sibling::input[@type='radio']`).click()
})

Given('(the user )starts a new browser session', async function () {
  await this.context.close()
  this.context = await this.browser.newContext({
    baseURL: this.baseUrl,
    ignoreHTTPSErrors: true,
    viewport: { width: 1920, height: 1080 }
  })
  this.page = await this.context.newPage()
})

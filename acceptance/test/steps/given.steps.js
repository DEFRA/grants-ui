import { Given } from '@cucumber/cucumber'
import { pollForSuccess } from '../utils/polling.js'
import DefraAccountBar from '../page-objects/defra-account-bar.js'

Given('(the user )navigates to {string}', async function (path) {
  await this.page.goto(path)
})

Given('(the user )completes any login process as CRN {string}', async function (crn) {
  const isLoginRequired = await pollForSuccess(
    async () =>
      await this.page
        .locator(`//*[contains(text(), 'Sign in to')]`)
        .isVisible()
        .catch(() => false),
    5
  )

  if (isLoginRequired) {
    await this.page.locator(`//input[@id='crn']`).fill(crn)
    await this.page.locator(`//input[@id='password']`).fill(process.env.DEFRA_ID_USER_PASSWORD)
    await this.page.locator(`//button[@type='submit']`).click()
    // allow extra time for Defra ID sign in to succeed
    await this.page.waitForURL((url) => !url.href.includes('b2clogin.com'), { timeout: 20000 })
  }
})

Given('(the user )signs out of Defra ID', async function () {
  await DefraAccountBar.signOut(this.page)
  // allow extra time for Defra ID sign out to succeed
  await this.page
    .locator(`//h1[contains(text(),'Sign into your Defra account')]`)
    .waitFor({ state: 'visible', timeout: 20000 })
})

Given('(the user )selects SBI {string}', async function (sbi) {
  await this.page.locator(`//label[contains(text(),'SBI ${sbi}')]/preceding-sibling::input[@type='radio']`).click()
})

Given('(the user )starts a new browser session', async function () {
  await this.closeBrowser()
  await this.openBrowser()
})

import { Given } from '@wdio/cucumber-framework'
import { pollForSuccess } from '../utils/polling'
import DefraAccountBar from '../page-objects/defra-account-bar'

Given('(the user )navigates to {string}', async (page) => {
  await browser.url(page)
})

Given('(the user )completes any login process as CRN {string}', async (crn) => {
  const isLoginRequired = await pollForSuccess(
    async () => await $(`//*[contains(text(), 'Sign in to')]`).isExisting(),
    5
  )

  if (isLoginRequired) {
    await $(`//input[@id='crn']`).setValue(crn)
    await $(`//input[@id='password']`).setValue(process.env.DEFRA_ID_USER_PASSWORD)
    await $(`//button[@type='submit']`).click()
    // allow extra time for Defra ID sign in to succeed
    await expect(browser).not.toHaveUrl(expect.stringContaining('b2clogin.com'), { wait: 20000 })
  }
})

Given('(the user )signs out of Defra ID', async () => {
  await DefraAccountBar.signOut()
  // allow extra time for Defra ID sign out to succeed
  await expect($(`//h1[contains(text(),'Sign into your Defra account')]`)).toBeDisplayed({ wait: 20000 })
})

Given('(the user )selects SBI {string}', async (sbi) => {
  await $(`//label[contains(text(),'SBI ${sbi}')]/preceding-sibling::input[@type='radio']`).click()
})

Given('(the user )starts a new browser session', async () => {
  await browser.reloadSession()
})

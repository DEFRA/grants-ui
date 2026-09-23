/**
 * Fill and submit the DefraID stub's login form. Shared by the acceptance
 * suite's `logs in as CRN` step and journey-cli.js's headless driver so the
 * selectors only need to change in one place if the stub's markup changes.
 * @param {import('@playwright/test').Page} page
 * @param {string} crn
 * @param {string | undefined} [password]
 */
export async function submitDefraIdLogin(page, crn, password = process.env.DEFRA_ID_USER_PASSWORD) {
  await page.locator("//input[@id='crn']").fill(crn)
  await page.locator("//input[@id='password']").fill(password)
  await page.locator("//button[@type='submit']").click()
}

import { Then, When } from '@cucumber/cucumber'
import expect from '../support/expect.js'

Then('the application selector should contain {int} distinct draft reference(s)', async function (count) {
  const rows = this.page.locator('tbody tr')
  await expect(rows).toHaveCount(count)
  const references = await rows.locator('th').allTextContents()
  expect(new Set(references.map((reference) => reference.trim())).size).toBe(count)
  await expect(rows.locator('a')).toHaveCount(count)
  for (let index = 0; index < count; index++) {
    await expect(rows.nth(index)).toContainText('Draft')
    await expect(rows.nth(index).getByRole('link')).toContainText('Continue application')
  }
})

When('the user continues the oldest draft application', async function () {
  await this.page.locator('tbody tr').last().getByRole('link').click()
})

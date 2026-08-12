import { Then } from '@cucumber/cucumber'
import expect from '../support/expect.js'

Then('(the user )should see the following selected land parcel', async function (dataTable) {
  for (const row of dataTable.hashes()) {
    const label = row.FIELD
    const valueCell = this.page.locator(`//dt[contains(text(),'${label}')]/following-sibling::dd[1]`)
    await expect(valueCell).toHaveText(row.VALUE)
  }
})

Then('(the user )should see the following actions with guidance', async function (dataTable) {
  let action = ''
  for (const row of dataTable.hashes()) {
    action = row.ACTION || action
    const hint = this.page.locator(
      `//input[@type='checkbox'][@value='${action}']/following-sibling::label//span[@class='select-actions-hint']`
    )
    await expect(hint).toContainText(row.GUIDANCE)
  }
})

import { Then, When } from '@cucumber/cucumber'
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
    const label = this.page.locator(`//input[@type='checkbox'][@value='${action}']/parent::div//label`)

    if (row.DESCRIPTION) {
      await expect(label).toContainText(row.DESCRIPTION)
    }

    const hint = label.locator('span.select-actions-hint')
    await expect(hint).toContainText(row.GUIDANCE)

    if (row.URL === 'Yes') {
      await expect(label.locator('a.action-guidance-link')).toBeVisible()
    }
  }
})

When('(the user )selects action {string}', async function (action) {
  const checkbox = this.page.locator(`//input[@type='checkbox'][@value='${action}']`)
  if (!(await checkbox.isChecked())) {
    await checkbox.click()
  }
})

When('(the user )deselects action {string}', async function (action) {
  const checkbox = this.page.locator(`//input[@type='checkbox'][@value='${action}']`)
  if (await checkbox.isChecked()) {
    await checkbox.click()
  }
})

When('(the user )enters {string} hectares for action {string}', async function (quantity, action) {
  const input = this.page.locator(`#landActionQuantity_${action}`)
  await input.fill(quantity)
  await input.blur()
  await expect(this.page.locator(`#landActionQuantity_${action}-refresh-banner`)).toHaveClass(
    /select-actions-refresh-banner--hidden/
  )
})

Then('(the user )should see {string} hectares available for action {string}', async function (quantity, action) {
  await expect(this.page.locator(`#landActionQuantity_${action}-hint`)).toContainText(`${quantity} hectares available`)
})

Then('(the user )should see {string} for action {string}', async function (errorText, action) {
  await expect(this.page.locator(`#landActionQuantity_${action}-error`)).toContainText(errorText)
})

Then('(the user )should be unable to select action {string}', async function (action) {
  await expect(this.page.locator(`//input[@type='checkbox'][@value='${action}']`)).toBeDisabled()
})

Then('(the user )should be able to select action {string}', async function (action) {
  await expect(this.page.locator(`//input[@type='checkbox'][@value='${action}']`)).toBeEnabled()
})

Then('(the user )should not see action {string}', async function (action) {
  await expect(this.page.locator(`//input[@type='checkbox'][@value='${action}']`)).toBeHidden()
})

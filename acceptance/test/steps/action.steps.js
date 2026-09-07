import { Then, When } from '@cucumber/cucumber'
import expect from '../support/expect.js'

Then('(the user )should see the following selected land parcel', async function (dataTable) {
  for (const row of dataTable.hashes()) {
    const label = row.FIELD
    const valueCell = this.page.locator(`//dt[contains(text(),'${label}')]/following-sibling::dd[1]`)
    await expect(valueCell).toHaveText(row.VALUE)
  }
})

Then('(the user )should see the following parcel summary cards', async function (dataTable) {
  let parcelReference = ''
  let rowIndex = 0

  for (const row of dataTable.hashes()) {
    if (row.PARCEL && row.PARCEL !== parcelReference) {
      parcelReference = row.PARCEL
      rowIndex = 0
    }

    const card = this.page.locator('.govuk-summary-card', {
      has: this.page.locator('.govuk-summary-card__title', { hasText: `Parcel reference ${parcelReference}` })
    })
    const cells = card.locator('table.govuk-table tbody tr').nth(rowIndex)

    await expect(cells.locator('th')).toHaveText(row.ACTION)
    await expect(cells.locator('td').nth(0)).toHaveText(row.QUANTITY)
    await expect(cells.locator('td').nth(1)).toHaveText(row['YEARLY PAYMENT'])

    rowIndex++
  }
})

Then('(the user )should see total yearly payment {string}', async function (amount) {
  const valueCell = this.page.locator(`//dt[contains(text(),'Total yearly payment')]/following-sibling::dd[1]`)
  await expect(valueCell).toHaveText(amount)
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

When(
  '(the user )clicks the change link for action {string} for parcel {string}',
  async function (action, parcelReference) {
    const card = this.page.locator('.govuk-summary-card', {
      has: this.page.locator('.govuk-summary-card__title', { hasText: `Parcel reference ${parcelReference}` })
    })
    const row = card.locator('table.govuk-table tbody tr', { has: this.page.locator(`th:has-text("(${action})")`) })
    await row.getByRole('link', { name: 'Change' }).click()
  }
)

When('(the user )clicks the add more actions link for parcel {string}', async function (parcelReference) {
  const card = this.page.locator('.govuk-summary-card', {
    has: this.page.locator('.govuk-summary-card__title', { hasText: `Parcel reference ${parcelReference}` })
  })
  await card.getByRole('link', { name: 'Add more actions to this parcel' }).click()
})

When('(the user )clicks the remove parcel link for parcel {string}', async function (parcelReference) {
  const card = this.page.locator('.govuk-summary-card', {
    has: this.page.locator('.govuk-summary-card__title', { hasText: `Parcel reference ${parcelReference}` })
  })
  await card.getByRole('link', { name: 'Remove parcel' }).click()
})

Then('(the user )should see action {string} selected', async function (action) {
  await expect(this.page.locator(`//input[@type='checkbox'][@value='${action}']`)).toBeChecked()
})

Then('(the user )should see action {string} selected with {string} hectares', async function (action, quantity) {
  await expect(this.page.locator(`//input[@type='checkbox'][@value='${action}']`)).toBeChecked()
  await expect(this.page.locator(`#landActionQuantity_${action}`)).toHaveValue(quantity)
})

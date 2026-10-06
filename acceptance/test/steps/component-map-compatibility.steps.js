import { Given, Then } from '@cucumber/cucumber'
import { openComponentMapFixture, verifyComponentMapCompatibility } from '../utils/component-map-compatibility.js'

Given('the forms map compatibility fixture is open', async function () {
  this.componentMapErrors = []
  this.page.on('pageerror', (error) => this.componentMapErrors.push(error.message))
  await openComponentMapFixture(this.page)
})

Then('the installed map dependencies should support the location adapter', async function () {
  await verifyComponentMapCompatibility(this.page, this.componentMapErrors)
})

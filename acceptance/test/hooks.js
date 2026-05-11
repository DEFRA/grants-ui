import { Before, After } from '@cucumber/cucumber'

Before(async function () {
  await this.openBrowser()
})

After(async function () {
  await this.closeBrowser()
})

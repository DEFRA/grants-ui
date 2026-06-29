import { Given, Then } from '@cucumber/cucumber'
import expect from '../support/expect.js'
import { PLAYWRIGHT_PAGE_TIMEOUT_MS } from '../support/world.js'

Given('the user starts a new browser session with GA request tracking', async function () {
  await this.context.close()
  this.gaCollectRequests = []
  this.context = await this.browser.newContext({
    baseURL: this.baseUrl,
    ignoreHTTPSErrors: true,
    viewport: { width: 1920, height: 1080 },
    storageState: { cookies: [], origins: [] }
  })
  await this.context.route(/google-analytics\.com\/g\/collect/, (route) => {
    this.gaCollectRequests.push(route.request().url())
    route.fulfill({ status: 204, body: '' })
  })
  this.page = await this.context.newPage()
  this.page.setDefaultTimeout(PLAYWRIGHT_PAGE_TIMEOUT_MS)
})

Given('the user starts a new browser session with JavaScript disabled', async function () {
  await this.context.close()
  this.nsHtmlRequests = []
  this.context = await this.browser.newContext({
    baseURL: this.baseUrl,
    ignoreHTTPSErrors: true,
    viewport: { width: 1920, height: 1080 },
    storageState: { cookies: [], origins: [] },
    javaScriptEnabled: false
  })
  this.context.on('request', (req) => {
    if (req.url().includes('googletagmanager.com/ns.html')) {
      this.nsHtmlRequests.push(req.url())
    }
  })
  this.page = await this.context.newPage()
  this.page.setDefaultTimeout(PLAYWRIGHT_PAGE_TIMEOUT_MS)
})

Then('no GA collect requests should have fired after waiting {int} seconds', async function (seconds) {
  await this.page.waitForTimeout(seconds * 1000)
  expect(this.gaCollectRequests).toHaveLength(0)
})

Then('a GA collect request should fire', async function () {
  await expect.poll(() => this.gaCollectRequests.length).toBeGreaterThan(0)
})

Then('the user should see notification {string}', async function (text) {
  await expect(this.page.getByText(text)).toBeVisible()
})

Then('a GA ns.html request should have fired', async function () {
  await this.page.waitForLoadState('load')
  expect(this.nsHtmlRequests.length).toBeGreaterThan(0)
})

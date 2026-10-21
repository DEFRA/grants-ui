import { setWorldConstructor, Before, After, setDefaultTimeout } from '@cucumber/cucumber'
import { chromium } from '@playwright/test'
import { createScenarioAuditQueue, deleteScenarioAuditQueue } from '../utils/audit.js'

export const CUCUMBER_STEP_TIMEOUT_MS = parseInt(process.env.CUCUMBER_STEP_TIMEOUT_MS) || 60000
export const PLAYWRIGHT_PAGE_TIMEOUT_MS = parseInt(process.env.PLAYWRIGHT_PAGE_TIMEOUT_MS) || 55000
export const PLAYWRIGHT_EXPECT_TIMEOUT_MS = parseInt(process.env.PLAYWRIGHT_EXPECT_TIMEOUT_MS) || 55000

setDefaultTimeout(CUCUMBER_STEP_TIMEOUT_MS)

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const HEADLESS = process.env.HEADLESS === 'true'

// The <parcel-map> bundle (javascripts/parcel-map.js, or parcel-map.<hash>.min.js in production).
// Map steps drive the page with synthetic parcel-map:* events, so the real map is never needed.
// Left to run, it races those steps: where it can't load (e.g. no tile access or WebGL in CI) it
// times out and dispatches parcel-map:error, which disables Continue mid-scenario.
const PARCEL_MAP_BUNDLE = /\/javascripts\/parcel-map(\.[0-9a-f]+\.min)?\.js(\?.*)?$/

class GrantsUiWorld {
  async init() {
    this.browser = await chromium.launch({
      headless: HEADLESS,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: ['--no-sandbox', '--disable-dev-shm-usage']
    })
    this.context = await this.browser.newContext({
      baseURL: BASE_URL,
      ignoreHTTPSErrors: true,
      viewport: { width: 1920, height: 1080 }
    })
    await this.context.route(PARCEL_MAP_BUNDLE, (route) =>
      route.fulfill({ status: 200, contentType: 'text/javascript', body: '' })
    )
    this.page = await this.context.newPage()
    this.page.setDefaultTimeout(PLAYWRIGHT_PAGE_TIMEOUT_MS)
    this.baseUrl = BASE_URL
  }

  async cleanup() {
    await this.context?.close()
    await this.browser?.close()
  }
}

setWorldConstructor(GrantsUiWorld)

Before(async function () {
  await this.init()
  this.auditQueue = await createScenarioAuditQueue()
})

After(async function () {
  await this.cleanup()
  if (this.auditQueue) {
    await deleteScenarioAuditQueue(this.auditQueue)
  }
})

import { setWorldConstructor, Before, After, setDefaultTimeout } from '@cucumber/cucumber'
import { chromium } from '@playwright/test'
import { createScenarioAuditQueue, deleteScenarioAuditQueue } from '../utils/audit.js'

export const CUCUMBER_STEP_TIMEOUT_MS = 60000
export const PLAYWRIGHT_PAGE_TIMEOUT_MS = 55000
export const PLAYWRIGHT_EXPECT_TIMEOUT_MS = 55000

setDefaultTimeout(CUCUMBER_STEP_TIMEOUT_MS)

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const BASE_BACKEND_URL = process.env.BASE_BACKEND_URL || 'http://localhost:3001'
const HEADLESS = process.env.HEADLESS === 'true'

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
    this.page = await this.context.newPage()
    this.page.setDefaultTimeout(PLAYWRIGHT_PAGE_TIMEOUT_MS)
    this.baseUrl = BASE_URL
    this.baseBackendUrl = BASE_BACKEND_URL
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

import { setWorldConstructor, Before, After, setDefaultTimeout } from '@cucumber/cucumber'
import { chromium } from '@playwright/test'
import { createScenarioAuditQueue, deleteScenarioAuditQueue } from '../utils/audit.js'

export const CUCUMBER_STEP_TIMEOUT_MS = parseInt(process.env.CUCUMBER_STEP_TIMEOUT_MS) || 60000
export const PLAYWRIGHT_PAGE_TIMEOUT_MS = parseInt(process.env.PLAYWRIGHT_PAGE_TIMEOUT_MS) || 55000
export const PLAYWRIGHT_EXPECT_TIMEOUT_MS = parseInt(process.env.PLAYWRIGHT_EXPECT_TIMEOUT_MS) || 55000

setDefaultTimeout(CUCUMBER_STEP_TIMEOUT_MS)

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const HEADLESS = process.env.HEADLESS === 'true'

// The land-parcel selection page renders a real MapLibre GL (WebGL) map. Headless
// Chromium in CI has no hardware GPU, so by default WebGL context creation fails
// ("BindToCurrentSequence failed"): the map dispatches parcel-map:error, the page
// disables the Continue button, and mapping.feature flakes (locally it passes
// because headed runs have a real GPU). Point ANGLE at Mesa's software Vulkan
// device (lavapipe, provided by the mesa-vulkan-swrast package in the Dockerfile)
// to give headless runs a reliable WebGL context. SwiftShader is not usable in
// this Alpine Chromium build, so the Vulkan backend is used instead.
const CHROMIUM_ARGS = ['--no-sandbox', '--disable-dev-shm-usage']
if (HEADLESS) {
  CHROMIUM_ARGS.push('--use-gl=angle', '--use-angle=vulkan', '--enable-features=Vulkan', '--ignore-gpu-blocklist')
}

class GrantsUiWorld {
  async init() {
    this.browser = await chromium.launch({
      headless: HEADLESS,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: CHROMIUM_ARGS
    })
    this.context = await this.browser.newContext({
      baseURL: BASE_URL,
      ignoreHTTPSErrors: true,
      viewport: { width: 1920, height: 1080 }
    })
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

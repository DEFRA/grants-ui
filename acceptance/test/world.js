import { setWorldConstructor, World, setDefaultTimeout } from '@cucumber/cucumber'
import { chromium } from 'playwright'

setDefaultTimeout(180000)

export class PlaywrightWorld extends World {
  constructor(options) {
    super(options)
    this.browser = null
    this.context = null
    this.page = null
  }

  get referenceNumbers() {
    return this._referenceNumbers ?? (this._referenceNumbers = [])
  }

  get expectationIds() {
    return this._expectationIds ?? (this._expectationIds = [])
  }

  async openBrowser() {
    const headless = process.env.HEADLESS === 'true'
    this.browser = await chromium.launch({
      headless,
      args: ['--no-sandbox', '--disable-gpu', '--ignore-certificate-errors']
    })
    this.context = await this.browser.newContext({
      baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
      ignoreHTTPSErrors: true,
      viewport: { width: 1920, height: 1080 }
    })
    this.page = await this.context.newPage()
  }

  async closeBrowser() {
    await this.browser?.close()
    this.browser = null
    this.context = null
    this.page = null
  }

  get baseURL() {
    return process.env.BASE_URL ?? 'http://localhost:3000'
  }

  get baseBackendURL() {
    return process.env.BASE_BACKEND_URL ?? 'http://localhost:3001'
  }
}

setWorldConstructor(PlaywrightWorld)

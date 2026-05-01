export const config = {
  baseUrl: `http://localhost:3000`,
  baseBackendUrl: `http://localhost:3001`,
  maxInstances: 1,
  capabilities: [
    {
      browserName: 'chrome',
      'goog:chromeOptions': {
        args: [
          '--no-sandbox',
          '--disable-infobars',
          '--disable-gpu',
          '--window-size=1920,1080',
          '--ignore-certificate-errors'
        ]
      }
    }
  ],
  runner: 'local',
  specs: ['./test/features/**/*.feature'],
  exclude: [],
  logLevel: 'info',
  logLevels: {
    webdriver: 'error'
  },
  bail: 0,
  waitforTimeout: 10000,
  waitforInterval: 200,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,
  framework: 'cucumber',
  reporters: ['spec'],
  cucumberOpts: {
    require: ['./test/steps/*.js'],
    backtrace: false,
    requireModule: [],
    dryRun: false,
    failFast: false,
    name: [],
    snippets: true,
    source: true,
    strict: false,
    tags: '@runme',
    timeout: 180000,
    ignoreUndefinedDefinitions: false
  },
  afterScenario: async function (world, result, context) {
    await browser.reloadSession()
  }
}

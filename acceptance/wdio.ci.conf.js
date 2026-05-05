import fs from 'node:fs'

export const config = {
  hostname: 'selenium-chrome',
  port: 4444,
  baseUrl: process.env.BASE_URL,
  baseBackendUrl: process.env.BASE_BACKEND_URL,
  maxInstances: parseInt(process.env.MAX_INSTANCES) || 1,
  capabilities: [
    {
      browserName: 'chrome',
      'goog:chromeOptions': {
        args: ['--headless', '--ignore-certificate-errors']
      }
    }
  ],
  runner: 'local',
  specs: ['./test/features/**/*.feature'],
  exclude: [],
  logLevel: 'warn',
  logLevels: {
    webdriver: 'error'
  },
  bail: 0,
  waitforTimeout: 10000,
  waitforInterval: 200,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,
  framework: 'cucumber',
  reporters: [
    [
      // spec reporter provides rolling output to the logger so you can see it in-progress
      'spec',
      {
        addConsoleLogs: true,
        realtimeReporting: true,
        color: false
      }
    ]
  ],
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
    tags: '@ci',
    timeout: 180000,
    ignoreUndefinedDefinitions: false
  },
  onComplete: async function (exitCode, config, capabilities, results) {
    // !Do Not Remove! Required to cause test suite to fail and return non-zero.
    if (results?.failed && results.failed > 0) {
      fs.writeFileSync('FAILED', JSON.stringify(results))
    }
  },
  afterScenario: async function (world, result, context) {
    await browser.reloadSession()
  }
}

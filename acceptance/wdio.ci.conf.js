import allure from 'allure-commandline'

export const config = {
  hostname: 'selenium-chrome',
  port: 4444,
  baseUrl: 'https://nginx:4000',
  baseBackendUrl: 'https://nginx:4001',
  maxInstances: 10,
  capabilities: [
    {
      browserName: 'chrome',
      'goog:chromeOptions': {
        args: ['--headless', '--ignore-certificate-errors', '--allow-insecure-localhost']
      }
    }
  ],
  runner: 'local',
  specs: ['./features/**/*.feature'],
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
  reporters: [
    [
      // spec reporter provides rolling output to the logger so you can see it in-progress
      'spec',
      {
        addConsoleLogs: true,
        realtimeReporting: true,
        color: false
      }
    ],
    [
      // allure is used to generate the final HTML report
      'allure',
      {
        outputDir: 'allure-results',
        useCucumberStepReporter: true
      }
    ]
  ],
  cucumberOpts: {
    require: ['./steps/*.js'],
    backtrace: false,
    requireModule: [],
    dryRun: false,
    failFast: false,
    name: [],
    snippets: true,
    source: true,
    strict: false,
    tagExpression: 'not @disabled',
    timeout: 180000,
    ignoreUndefinedDefinitions: false
  },
  onComplete: async function (exitCode, config, capabilities, results) {
    const generation = allure(['generate', 'allure-results', '--clean'])

    return new Promise((resolve, reject) => {
      const generationTimeout = setTimeout(
        () => reject(new Error('Could not generate Allure report, timeout exceeded')),
        30000
      )

      generation.on('exit', function (exitCode) {
        clearTimeout(generationTimeout)

        if (exitCode !== 0) {
          return reject(new Error(`Could not generate Allure report, exited with code: ${exitCode}`))
        }

        resolve()
      })
    })
  },
  afterStep: async function (step, scenario, { error, duration, passed }, context) {
    await browser.takeScreenshot()
  },
  afterScenario: async function (world, result, context) {
    await browser.reloadSession()
  }
}

// @ts-check
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  _comment:
    "This config was generated using 'stryker init'. Please take a look at: https://stryker-mutator.io/docs/stryker-js/configuration/ for more information.",
  packageManager: 'npm',
  reporters: ['html', 'clear-text', 'progress'],
  testRunner: 'vitest',
  coverageAnalysis: 'perTest',
  vitest: {
    configFile: 'vitest.stryker.config.js'
  },
  mutate: [
    'src/**/*.js',
    '!src/config/**',
    '!src/__mocks__/**',
    '!src/contracts/**',
    '!**/*.test.js',
    '!**/*.contract.test.js'
  ]
}
export default config

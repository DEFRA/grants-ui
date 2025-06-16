export default {
  testEnvironment: 'node',
  testMatch: [
    '**/test/contracts/**/*.test.js'
  ],
  testTimeout: 30000,
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js'
  ],
  coverageDirectory: 'coverage-contracts',
  verbose: true,
  transform: {
    '^.+\\.js$': 'babel-jest'
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@pact-foundation|node-fetch|fetch-blob|formdata-polyfill|data-uri-to-buffer)/)'
  ]
}
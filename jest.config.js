/**
 * @type {Config}
 */
export default {
  rootDir: '.',
  verbose: true,
  resetModules: true,
  clearMocks: true,
  silent: false,
  testMatch: ['**/src/**/*.test.js'],
  reporters: ['default', ['github-actions', { silent: false }], 'summary'],
  setupFiles: ['<rootDir>/.jest/setup-file.js'],
  setupFilesAfterEnv: ['<rootDir>/.jest/setup-file-after-env.js'],
  collectCoverageFrom: ['src/**/*.js'],
  coveragePathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/.server',
    '<rootDir>/.public',
    '<rootDir>/src/server/common/test-helpers',
    '<rootDir>/src/client/javascripts/application.js',
    '<rootDir>/src/index.js',
    'index.js'
  ],
  coverageDirectory: '<rootDir>/coverage',
  transform: {
    '^.+\\.js$': 'babel-jest'
  },
  // Create module name mapper for your mocks
  moduleNameMapper: {
    '^@defra/forms-engine-plugin$': '<rootDir>/src/__mocks__/@defra/forms-engine-plugin.cjs',
    '^@defra/forms-model$': '<rootDir>/src/__mocks__/@defra/forms-model.cjs',
    '^~/src/server/index.js$': '<rootDir>/src/__mocks__/server-index.js'
  },
  transformIgnorePatterns: [
    `node_modules/(?!${[
      '@defra/hapi-tracing', // Supports ESM only
      'node-fetch', // Supports ESM only
      '@defra/forms-engine-plugin',
      '@defra/forms-model'
    ].join('|')}/)`
  ]
}

/**
 * @import { Config } from 'jest'
 */

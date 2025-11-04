import baseConfig from './vitest.config.js'

export default {
  ...baseConfig,
  test: {
    ...baseConfig.test,

    exclude: [
      '**/node_modules/**',
      '**/*.contract.test.js',
      '**/src/server/common/services/grant-application/grant-application.service.test.js',
      '**/src/server/common/helpers/start-server.test.js',
      '**/src/server/common/helpers/retry.test.js'
    ],
    coverage: {
      ...baseConfig.test.coverage,
      enabled: true
    }
  }
}

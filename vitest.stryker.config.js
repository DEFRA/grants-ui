import baseConfig from './vitest.config.js'

export default {
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: ['src/**/*.test.js'],
    exclude: ['**/contracts/**', '**/server/common/helpers/errors.test.js', '**/server/common/helpers/retry.test.js']
  }
}

import baseConfig from './vitest.config.js'

export default {
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: ['src/**/*.test.js'],
    exclude: ['**/server/common/helpers/errors.test.js']
  }
}

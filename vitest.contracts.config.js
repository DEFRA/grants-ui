import baseConfig from './vitest.config.js'

export default {
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: ['**/src/contracts/**/*.test.js'],
    fileParallelism: false,
    coverage: {
      ...baseConfig.test.coverage,
      enabled: false
    }
  }
}

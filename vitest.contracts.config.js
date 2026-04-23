import baseConfig from './vitest.config.js'

export default {
  ...baseConfig,
  test: {
    ...baseConfig.test,
    globals: true,
    environment: 'node',
    include: ['src/contracts/**/*.contract.test.js'],
    fileParallelism: false,
    setupFiles: [],
    coverage: {
      enabled: false
    },
    reporters: ['default'],
    env: {
      GAS_API_AUTH_TOKEN: '00000000-0000-0000-0000-000000000000'
    }
  }
}

export default {
  root: '.',
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./.vitest/setup-file.js'],
    include: ['**/src/**/*.test.js'],
    coverage: {
      enabled: true,
      provider: 'v8',
      include: ['src/**/*.js'],
      exclude: [
        '**/node_modules/**',
        '**/.server/**',
        '**/.public/**',
        '**/src/server/common/test-helpers/**',
        '**/src/client/javascripts/application.js',
        '**/src/index.js',
        '**/index.js'
      ],
      reportsDirectory: './coverage'
    }
  },
  resolve: {
    alias: {
      '~': new URL('./', import.meta.url).pathname,
      '@defra/forms-engine-plugin$': new URL('./src/__mocks__/@defra/forms-engine-plugin.cjs', import.meta.url)
        .pathname,
      '@defra/forms-model$': new URL('./src/__mocks__/@defra/forms-model.cjs', import.meta.url).pathname,
      '~/src/server/index.js$': new URL('./src/__mocks__/server-index.js', import.meta.url).pathname
    }
  }
}

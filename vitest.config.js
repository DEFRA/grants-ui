/* eslint-disable no-console */
export default {
  root: '.',
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./.vitest/setup-file.js'],
    include: ['**/src/**/*.test.js', '**/scripts/**/*.test.js', '**/tools/**/*.test.js'],
    exclude: ['**/node_modules/**', '**/.stryker-tmp/**', '**/*.contract.test.js', '**/.claude/**'],
    env: {
      GAS_API_AUTH_TOKEN: '00000000-0000-0000-0000-000000000000'
    },
    reporters: ['default', CoverageAnalyserReporter()],
    coverage: {
      enabled: true,
      provider: 'v8',
      include: ['src/**/*.js'],
      reporter: ['json', 'lcov', 'text', 'html'],
      exclude: [
        '**/node_modules/**',
        '**/.server/**',
        '**/.stryker-tmp',
        '**/.public/**',
        '**/test-helpers/**',
        '**/test-helpers.js',
        '**/src/index.js',
        '**/index.js',
        '**/__mocks__/**',
        '**/test-constants.js',
        '**/*.d.js',
        '**/logger-options.js',
        '**/config.js',
        '**/config/land-grants.js',
        '**/dev-tools/journey-runner/runner-engine.js'
      ],
      reportsDirectory: './coverage'
    }
  },
  resolve: {
    alias: {
      '~': new URL('./', import.meta.url).pathname,
      '@defra/forms-engine-plugin/controllers/QuestionPageController.js': new URL(
        './src/__mocks__/@defra/forms-engine-plugin-question.js',
        import.meta.url
      ).pathname,
      '@defra/forms-engine-plugin/controllers/SummaryPageController.js': new URL(
        './src/__mocks__/@defra/forms-engine-plugin-summary.js',
        import.meta.url
      ).pathname,
      '@defra/forms-engine-plugin$': new URL('./src/__mocks__/@defra/forms-engine-plugin.js', import.meta.url).pathname,
      '@defra/forms-model$': new URL('./src/__mocks__/@defra/forms-model.js', import.meta.url).pathname
    }
  }
}

function CoverageAnalyserReporter() {
  return {
    /** @param {{ getCoverageSummary: () => { lines: { total: number, covered: number } } }} coverage */
    onCoverage(coverage) {
      const { total, covered } = coverage.getCoverageSummary().lines
      console.log('\nCoverage Analysis Results')
      console.log('='.repeat(50))
      console.log(`Total Uncovered Lines: ${total - covered}`)
    }
  }
}

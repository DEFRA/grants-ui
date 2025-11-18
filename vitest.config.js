/* eslint-disable no-console */
import fs from 'fs'

export default {
  root: '.',
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./.vitest/setup-file.js'],
    include: ['**/src/**/*.test.js'],
    exclude: ['**/node_modules/**', '**/.stryker-tmp/**'],
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
        '**/src/server/common/test-helpers/**',
        '**/src/client/javascripts/application.js',
        '**/src/index.js',
        '**/index.js',
        '**/__mocks__/**',
        '**/test-constants.js',
        '**/*.d.js',
        '**/logger-options.js',
        '**/config.js',
        '**/config/land-grants.js',
        '**/plugins/tasklist-back-button.js'
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
      '@defra/forms-model$': new URL('./src/__mocks__/@defra/forms-model.js', import.meta.url).pathname,
      '~/src/server/index.js$': new URL('./src/__mocks__/server-index.js', import.meta.url).pathname
    }
  }
}

function loadCoverageData() {
  const COVERAGE_FILE = './coverage/coverage-final.json'
  if (!fs.existsSync(COVERAGE_FILE)) {
    return null
  }

  try {
    const rawData = fs.readFileSync(COVERAGE_FILE, 'utf8')
    return JSON.parse(rawData)
  } catch (error) {
    console.error('Failed to parse coverage file:', error.message)
    return null
  }
}

function calculateUncoveredLines(coverageData) {
  let totalUncovered = 0
  const fileDetails = []

  for (const [filePath, fileData] of Object.entries(coverageData)) {
    const { statementMap, s: statements } = fileData
    let fileUncovered = 0

    for (const [statementId, covered] of Object.entries(statements)) {
      if (covered === 0) {
        const statement = statementMap[statementId]
        if (statement) {
          const startLine = statement.start.line
          const endLine = statement.end.line
          fileUncovered += endLine - startLine + 1
        }
      }
    }

    if (fileUncovered > 0) {
      fileDetails.push({
        file: filePath.replace(process.cwd() + '/', ''),
        uncoveredLines: fileUncovered
      })
    }

    totalUncovered += fileUncovered
  }

  return { totalUncovered, fileDetails }
}
function CoverageAnalyserReporter() {
  return {
    onFinished() {
      setTimeout(() => {
        const coverageData = loadCoverageData()
        if (coverageData) {
          const results = calculateUncoveredLines(coverageData)
          console.log('\nCoverage Analysis Results')
          console.log('='.repeat(50))
          console.log(`Total Uncovered Lines: ${results.totalUncovered}`)
        }
      }, 100)
    }
  }
}

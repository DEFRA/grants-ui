// @vitest-environment node
import { expect, test } from 'vitest'
import { createProgressTracker } from './progress.js'

test('tracks completed unit test files, including failures, without double counting', () => {
  const progress = createProgressTracker('test', ['unit'])
  expect(progress(' RUN v4.1.11 /workspace')).toBe('unit: collecting tests')
  expect(progress(' ✓ src/first.test.js (2 tests) 3ms')).toBe('unit: 1 test file completed')
  expect(progress(' ❯ src/second.test.js (3 tests | 1 failed)')).toBe('unit: 2 test files completed')
  expect(progress(' ✓ src/first.test.js (2 tests) 3ms')).toBe('unit: 2 test files completed')
  expect(progress(' % Coverage report from v8')).toBe('unit: coverage report ready')
  expect(progress('secret-bearing application output')).toBeNull()
})

test('combined runs switch suites and reset counts before Snyk and Sonar', () => {
  const progress = createProgressTracker('check')
  expect(progress(' ▶ npm run test (Full unit suite)')).toBe('unit: starting tests')
  expect(progress(' ✓ src/first.test.js (2 tests)')).toBe('unit: 1 test file completed')
  expect(progress(' ▶ npm run test:contracts (Contract tests)')).toBe('contracts: starting tests')
  expect(progress(' ✓ src/first.test.js (2 tests)')).toBe('contracts: 1 test file completed')
  expect(progress(' ▶ npm run test:acceptance (Docker acceptance)')).toBe('Acceptance: preparing test stack')
  expect(progress(' ▶ snyk test (dependency scan)')).toBe('Snyk: scanning dependencies')
  expect(progress(' ▶ docker compose -f compose.sonar.yml up -d sonarqube')).toBe('Sonar: starting analysis server')
  expect(progress(' ▶ docker compose -f compose.sonar.yml run --rm sonar-scanner -Dsonar.token=secret')).toBe(
    'Sonar: analysing code'
  )
  expect(progress('pre-pr check summary')).toBe('Pre-PR check: preparing results')
})

test('acceptance reports setup, readiness, execution and cleanup from actual milestones', () => {
  const progress = createProgressTracker('test', ['acceptance'])
  expect(progress('Building docker compose containers...')).toBe('Acceptance: building containers')
  expect(progress('Starting services with docker compose...')).toBe('Acceptance: starting services')
  expect(progress('...Service started, now waiting for health check to pass...')).toBe(
    'Acceptance: waiting for health checks'
  )
  expect(progress('hhWaiting for example-grant-with-auth backend definition to be available...')).toBe(
    'Acceptance: waiting for form definitions'
  )
  expect(progress('Running Acceptance Tests...')).toBe('Acceptance: running browser tests')
  expect(progress('Cleaning up docker compose stacks...')).toBe('Acceptance: cleaning up containers')
})

test('up reports image and health progress without repeating sensitive or verbose output', () => {
  const progress = createProgressTracker('up')
  expect(progress('▶ Running pre-up script: /workspace/setup.sh')).toBe('Docker: preparing local configuration')
  expect(progress('Image example Pulling')).toBe('Docker: pulling images')
  expect(progress(' Container service-a Starting')).toBe('Docker: starting containers')
  expect(progress(' Container service-a Waiting')).toBe('Docker: waiting for healthy services')
  expect(progress(' Container service-a Healthy')).toBe('Docker: 1 service healthy')
  expect(progress(' Container service-a Healthy')).toBe('Docker: 1 service healthy')
  expect(progress('\x1b[32m Container service-b Healthy\x1b[0m')).toBe('Docker: 2 services healthy')
  expect(progress('▶ Applying local form-definition overrides…')).toBe('Docker: reconciling form-def overrides')
})

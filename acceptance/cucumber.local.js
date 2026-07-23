process.env.CUCUMBER_STEP_TIMEOUT_MS = '30000'
process.env.PLAYWRIGHT_PAGE_TIMEOUT_MS = '25000'
process.env.PLAYWRIGHT_EXPECT_TIMEOUT_MS = '25000'

const common = {
  paths: ['test/features/**/*.feature'],
  require: ['test/support/world.js', 'test/steps/*.js'],
  requireModule: [],
  tags: '@runme',
  format: ['progress-bar'],
  parallel: 1
}

export default common

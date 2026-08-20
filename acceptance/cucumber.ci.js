process.env.HEADLESS = 'true'

const common = {
  paths: ['test/features/**/*.feature'],
  require: ['test/support/world.js', 'test/steps/*.js'],
  requireModule: [],
  tags: 'not @disabled',
  format: ['progress'],
  parallel: parseInt(process.env.MAX_INSTANCES) || 1
}

export default common

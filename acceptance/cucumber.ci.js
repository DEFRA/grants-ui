process.env.HEADLESS = 'true'

const common = {
  paths: ['test/features/**/*.feature'],
  require: ['test/support/world.js', 'test/steps/*.js'],
  requireModule: [],
  format: ['progress'],
  parallel: parseInt(process.env.MAX_INSTANCES) || 1
}

export default common

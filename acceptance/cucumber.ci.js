process.env.HEADLESS = 'true'

export default {
  paths: ['test/features/**/*.feature'],
  require: ['test/world.js', 'test/hooks.js', 'test/steps/*.js'],
  requireModule: [],
  format: ['progress'],
  parallel: parseInt(process.env.MAX_INSTANCES) || 1,
  exit: true
}

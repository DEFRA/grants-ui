const common = {
  paths: ['test/features/**/*.feature'],
  require: ['test/support/world.js', 'test/steps/*.js'],
  requireModule: [],
  tags: '@runme',
  format: ['progress-bar'],
  parallel: 1
}

export default common

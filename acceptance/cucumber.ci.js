process.env.HEADLESS = 'true'

const common = {
  paths: ['test/features/**/*.feature'],
  require: ['test/support/world.js', 'test/steps/*.js'],
  requireModule: [],
  // Scenarios tagged @disabled are blocked on work outside this suite. Each one
  // carries a comment naming what has to land before the tag comes off.
  tags: 'not @disabled',
  format: ['progress'],
  parallel: parseInt(process.env.MAX_INSTANCES) || 1
}

export default common

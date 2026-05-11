process.env.DEFRA_ID_USER_PASSWORD ??= 'x'
process.env.GRANTS_UI_BACKEND_AUTH_TOKEN ??= 'auth_token'
process.env.GRANTS_UI_BACKEND_ENCRYPTION_KEY ??= 'encryption_key'
process.env.APPLICATION_LOCK_TOKEN_SECRET ??= 'dev-lock-secret'
process.env.MOCKSERVER_HOST ??= 'localhost'
process.env.MOCKSERVER_PORT ??= '1080'

export default {
  paths: ['test/features/**/*.feature'],
  require: ['test/world.js', 'test/hooks.js', 'test/steps/*.js'],
  requireModule: [],
  tags: '@runme',
  format: ['progress'],
  parallel: parseInt(process.env.MAX_INSTANCES) || 1
}

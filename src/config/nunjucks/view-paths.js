import path from 'node:path'

/**
 * Directories nunjucks resolves templates/components against. Kept in its own
 * side-effect-free module (no config.get(), no nunjucks.configure()) so it can be
 * imported anywhere a template needs to resolve a path without pulling in the full
 * app config/context bootstrap that nunjucks.js performs at import time.
 */
export const govukFrontendPath = 'node_modules/govuk-frontend/dist/'

export const viewPaths = (() => {
  const serverDir = path.resolve(path.join(process.cwd(), 'src/server'))
  return [
    path.join(serverDir, 'views'),
    path.join(serverDir, 'auth/views'),
    path.join(serverDir, 'check-responses/views'),
    path.join(serverDir, 'details-page/views'),
    path.join(serverDir, 'common/components'),
    path.join(serverDir, 'common/templates'),
    path.join(serverDir, 'confirmation/views'),
    path.join(serverDir, 'cookies/views'),
    path.join(serverDir, 'declaration/views'),
    path.join(serverDir, 'home/views'),
    path.join(serverDir, 'land-grants/views'),
    path.join(serverDir, 'payment/views'),
    path.join(serverDir, 'land-grants/components'),
    path.join(serverDir, 'non-land-grants/pigs-might-fly/views'),
    path.join(serverDir, 'non-land-grants/methane/views'),
    path.join(serverDir, 'score-results/views'),
    path.join(serverDir, 'task-list/views'),
    path.join(serverDir, 'print-submitted-application/views'),
    path.join(serverDir, 'woodland/views'),
    path.join(serverDir, 'cannot-submit/views'),
    path.join(serverDir, 'common/map/views'),
    path.join(serverDir, 'schemes/grasslands/views'),
    path.join(serverDir, 'application-deleted/views')
  ]
})()

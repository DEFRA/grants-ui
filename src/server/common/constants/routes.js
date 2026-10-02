/**
 * The forms-engine-plugin's own journey route path templates (see its
 * `routes/questions.js`). `SLUG_ROOT_ROUTE` is the grant's entry point -
 * the only journey route a user can land on directly (typed/bookmarked/
 * clicked); the engine's own internal redirects only ever go away from it,
 * never back onto it.
 */
export const SLUG_ROOT_ROUTE = '/{slug}'

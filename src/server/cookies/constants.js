import { config } from '~/src/config/config.js'

/**
 * Cookie-related constants used throughout the application
 * This provides a single source of truth for cookie-related URLs and paths
 * The URL can be configured via the COOKIE_POLICY_URL environment variable
 */

export const COOKIE_PAGE_URL = config.get('cookieConsent.cookiePolicyUrl')

import { config } from '~/src/config/config.js'

/**
 * Cookie-related constants used throughout the application
 * This provides a single source of truth for cookie-related URLs and paths
 * The URL can be configured via the COOKIE_POLICY_URL environment variable
 */

export const COOKIE_PAGE_URL = config.get('cookieConsent.cookiePolicyUrl')

/**
 * Maximum allowed length for a return URL.
 * URLs in practice are typically well under 2048 characters (the IE limit),
 * so 2048 is used here as a safe, standards-aligned upper bound.
 */
export const MAX_RETURN_URL_LENGTH = 2048

import { config } from '~/src/config/config.js'
import { escapeHtml } from '~/src/server/common/utils/escape-html.js'

/**
 * Whether an href is safe to render as a link. Allows only http(s) URLs and same-origin
 * relative paths — rejects `javascript:`, `data:` and other script-bearing schemes.
 * Form definitions can be served from the backend, so the href is not fully trusted.
 * @param {string} href
 * @returns {boolean}
 */
const isSafeHref = (href) => {
  try {
    const { protocol } = new URL(href, 'https://relative.invalid/')
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Validates an optional link block, throwing when one is declared without both `text` and `href`.
 * @param {{ text?: string, href?: string }} [link]
 * @throws {Error} When a `link` is declared without both `text` and `href`
 */
const assertLinkValid = (link) => {
  // A link is optional, but if one is declared it must be complete.
  if (link != null && (!link.text || !link.href)) {
    throw new Error('Notification banner is enabled but the link is missing "text" or "href"')
  }
}

/**
 * Renders the banner body, returning HTML with a link when one is present and safe,
 * otherwise the plain message text.
 * @param {string} text
 * @param {{ text?: string, href?: string }} [link]
 * @returns {{ text: string } | { html: string }}
 */
const renderBannerBody = (text, link) => {
  if (link?.text && link.href && isSafeHref(link.href)) {
    return {
      // Keep the link on its own line below the message rather than running inline.
      html:
        `<p class="govuk-notification-banner__heading">${escapeHtml(text)}</p>` +
        `<p class="govuk-body"><a class="govuk-notification-banner__link" href="${escapeHtml(link.href)}">${escapeHtml(link.text)}</a></p>`
    }
  }

  return { text }
}

/**
 * Builds the GOV.UK notification banner params for the current grant/request, or `null`
 * when no banner should render. The banner is configured per grant via
 * `metadata.notificationBanner` and is hidden on the configured excluded pages
 * (by default the confirmation and print pages).
 * @param {NotificationBannerMetadata | undefined} notificationBanner - The `notificationBanner` block from the form metadata
 * @param {string | undefined} currentPath - The current request path
 * @param {string[]} [excludedPathSuffixes] - Path suffixes on which the banner is never shown (defaults to config)
 * @returns {{ titleText: string, classes: string, text?: string, html?: string } | null} GOV.UK notification banner params, or null
 * @throws {Error} When the banner is enabled but `titleText` is missing, or a `link` is declared without both `text` and `href`
 */
export const buildNotificationBannerConfig = (
  notificationBanner,
  currentPath,
  excludedPathSuffixes = config.get('notificationBanner.excludedPathSuffixes')
) => {
  if (notificationBanner?.enabled !== true) {
    return null
  }

  if (!notificationBanner.titleText) {
    throw new Error('Notification banner is enabled but "titleText" is not set')
  }

  assertLinkValid(notificationBanner.link)

  if (!notificationBanner.text) {
    return null
  }

  if (excludedPathSuffixes.some((suffix) => currentPath?.endsWith(suffix))) {
    return null
  }

  const { titleText, text, link } = notificationBanner
  const classes = 'govuk-!-margin-top-4 govuk-!-margin-bottom-0'

  return { titleText, classes, ...renderBannerBody(text, link) }
}

/**
 * @typedef {object} NotificationBannerMetadata
 * @property {boolean} [enabled]
 * @property {string} [titleText]
 * @property {string} [text]
 * @property {{ text?: string, href?: string }} [link]
 */

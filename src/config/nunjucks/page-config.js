/**
 * Helpers for reading the per-page `config` options that `hoistPageConfig`
 * (see `src/server/common/forms/services/form.js`) moves from each page in a
 * form definition onto `definition.metadata.pageConfig[path]`.
 *
 * These back the page-level `config:` block in a form definition, which lets a
 * backend-authored page override presentation without a dedicated controller:
 *
 *   - path: /check-your-answers
 *     config:
 *       submitButtonText: Agree and submit   # overrides grant-level options.submitButtonText
 *       hideBackLink: true                    # removes the back link on this page only
 *       rpaDetails:                           # renders a GDS details component at the bottom
 *         title: If you need help             # rendered as the details summary
 *         content: |                          # HTML rendered as the details text
 *           <p class="govuk-body">Contact us at ...</p>
 *
 * The template-facing helpers take the forms-engine `page` object (which exposes
 * `path` and `def`), mirroring `gridColumnClass`. The request-facing helper is
 * used from the nunjucks context builder where only the request is available.
 */

/**
 * @typedef {{
 *   path?: string,
 *   def?: { metadata?: { pageConfig?: Record<string, Record<string, unknown>>, supportEmail?: string } }
 * }} FormEnginePage
 */

/**
 * @typedef {object} RpaDetailsConfig
 * @property {string} title
 * @property {string} content
 */

/**
 * Resolve the hoisted per-page config for a forms-engine page controller.
 * @param {FormEnginePage} [page]
 * @returns {Record<string, unknown>}
 */
export function resolvePageConfig(page) {
  const path = page?.path
  return (path ? page?.def?.metadata?.pageConfig?.[path] : undefined) ?? {}
}

/**
 * Resolve the hoisted per-page config from a request, keyed by the current
 * forms-engine page path (`request.params.path`, e.g. `/check-your-answers`).
 * @param {{ params?: { path?: string }, app?: { model?: { def?: { metadata?: { pageConfig?: Record<string, Record<string, unknown>> } } } } }} [request]
 * @returns {Record<string, unknown>}
 */
export function resolvePageConfigFromRequest(request) {
  const pathParam = request?.params?.path
  const path = pathParam ? `/${pathParam}` : undefined
  const pageConfig = request?.app?.model?.def?.metadata?.pageConfig
  return (path ? pageConfig?.[path] : undefined) ?? {}
}

/**
 * Page-level submit button text override (grant-level `options.submitButtonText`
 * remains the fallback and is applied by the nunjucks context builder).
 * @param {{ params?: { path?: string }, app?: { model?: { def?: { metadata?: { pageConfig?: Record<string, Record<string, unknown>> } } } } }} [request]
 * @returns {string | undefined}
 */
export function pageSubmitButtonText(request) {
  const text = resolvePageConfigFromRequest(request).submitButtonText
  return typeof text === 'string' && text.length ? text : undefined
}

/**
 * Whether the back link should be hidden for this page.
 * @param {FormEnginePage} [page]
 * @returns {boolean}
 */
export function pageHideBackLink(page) {
  return resolvePageConfig(page).hideBackLink === true
}

/**
 * Resolve the RPA details component config for this page, or `null` when the
 * page has not opted in. Renders a GDS details component with `title` as the
 * summary and `content` (HTML) as the disclosed text.
 * @param {FormEnginePage} [page]
 * @returns {RpaDetailsConfig | null}
 */
export function pageRpaDetails(page) {
  const rpaDetails = resolvePageConfig(page).rpaDetails
  if (!rpaDetails || typeof rpaDetails !== 'object') {
    return null
  }

  const { title, content } = /** @type {{ title?: string, content?: string }} */ (rpaDetails)
  if (!title || !content) {
    return null
  }

  return {
    title,
    content
  }
}

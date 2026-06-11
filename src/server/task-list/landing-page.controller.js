import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'

/**
 * Custom controller for off-journey landing pages that are only reached via a
 * status redirect (a `grantRedirectRule`) or a direct link - for example an
 * "Application reopened" page.
 *
 * These pages are positioned after the final journey page so the default V2
 * page walk never reaches them.
 *
 * This controller resolves the onward path from the page's own `next` links
 * in the form definition (e.g. `next: - path: /summary`), even though `next`
 * links are normally ignored by the V2 engine. Conditions on the links are
 * still honoured, and we fall back to navigating to the start page if no link
 * matches (or there are no links).
 */
export default class LandingPageController extends QuestionPageController {
  allowSaveAndExit = false

  /**
   * Resolve the next path from the page definition's `next` links instead of
   * the default V2 page-order walk.
   * @param {FormContext} context
   * @returns {string | undefined}
   */
  getNextPath(context) {
    const { next, model } = this
    const { evaluationState, paths } = context

    // The engine builds the form context by walking pages from the start page
    // to the requested page, calling `getNextPath` on each page it passes
    // through (FormModel.getFormContext). During that walk `context.paths` is
    // still empty - it is only populated afterwards (assignPaths). Our custom
    // routing points BACKWARDS to `/summary`, so if we diverted during the
    // walk the engine would loop forever once a second off-journey page using
    // this controller exists (e.g. /summary -> /declaration -> /dropped ->
    // /summary -> ...), hanging the request. We therefore only apply the
    // next-link routing for real navigation (after POST/Continue), when
    // `context.paths` is populated, and defer to the default forward walk
    // while the context is being built.
    if (!paths.length) {
      return super.getNextPath(context)
    }

    const nextLink = next.find((link) => {
      const { condition } = link

      if (condition) {
        return model.conditions[condition]?.fn(evaluationState) ?? false
      }

      return true
    })

    // When no link matches (or there are no links at all) send the user back
    // to the start of the form rather than the default V2 walk, which would
    // resolve to `undefined` for these off-journey pages.
    return nextLink?.path ?? this.getStartPath()
  }

  /**
   * These pages are reached only via a status redirect or a direct link, so
   * there is no meaningful previous page to go back to. Returning `undefined`
   * suppresses the back link entirely.
   * @returns {undefined}
   */
  getBackLink() {
    return undefined
  }

  /**
   * Force the submit button on these pages to always read "Continue".
   *
   * A form can set `metadata.options.submitButtonText` (e.g. "Save and
   * continue") which the global nunjucks context injects into every page's
   * render. That label is meaningless on these off-journey interstitial pages,
   * which simply forward the user on. The view model returned here is merged
   * OVER the global context by Vision, so setting `submitButtonText` here
   * overrides the form-wide value and pins the label to "Continue".
   * @param {AnyFormRequest} request
   * @param {FormContext} context
   * @returns {ReturnType<QuestionPageController['getViewModel']>}
   */
  getViewModel(request, context) {
    return /** @type {ReturnType<QuestionPageController['getViewModel']>} */ ({
      ...super.getViewModel(request, context),
      submitButtonText: 'Continue'
    })
  }
}

/**
 * @import { AnyFormRequest, FormContext } from '@defra/forms-engine-plugin/engine/types.js'
 */

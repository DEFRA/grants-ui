import { SummaryPageController } from '@defra/forms-engine-plugin/controllers/SummaryPageController.js'
import { resolvePath } from '~/src/server/common/helpers/path-utils.js'
import { getTaskPageBackLink } from '~/src/server/task-list/task-list.helper.js'
import { buildConfirmLandAndActionsViewModel } from '~/src/server/land-grants/view-models/confirm-land-and-actions.view-model.js'
import { CONFIRM_LAND_AND_ACTIONS_PATH } from '~/src/server/land-grants/utils/confirm-land-and-actions-navigation.js'

export default class CheckResponsesPageController extends SummaryPageController {
  /**
   * @param {FormModel} model
   * @param {PageSummary} pageDef
   */
  constructor(model, pageDef) {
    super(model, pageDef)
    this.model = model
    this.viewName = 'check-responses-page'

    // Resolve section
    if (pageDef.section) {
      this.section = model.getSection(pageDef.section)
    }

    const pageConfig =
      /** @type {{ additionalSections?: AdditionalSection[], showDetailsConfirmation?: boolean, derivedStatePages?: string[] } | undefined} */ (
        model?.def?.metadata?.pageConfig?.[pageDef.path]
      )
    this.additionalSections = pageConfig?.additionalSections
    this.showDetailsConfirmation = pageConfig?.showDetailsConfirmation === true
    this.derivedStatePages = pageConfig?.derivedStatePages ?? []
  }

  /**
   * Refreshes applicable derived pages in configured dependency order, visiting
   * pages that require review and refreshing other results before rendering.
   * Include returnUrl in the destination: the engine strips it from GET redirects
   * made through getRelevantPath, losing the return to this Check answers page.
   * @param {AnyFormRequest} request
   * @param {FormContext} context
   * @param {FormResponseToolkit} h
   * @returns {Promise<ResponseObject | undefined>}
   */
  async #refreshDerivedPages(request, context, h) {
    if (context.isForceAccess) {
      return undefined
    }

    for (const path of this.derivedStatePages) {
      const page = context.relevantPages.find((candidate) => candidate.path === path)
      const derivedPage = /** @type {DerivedStatePage | undefined} */ (/** @type {unknown} */ (page))
      if (typeof derivedPage?.isStateStale !== 'function' || !(await derivedPage.isStateStale(request, context))) {
        continue
      }
      if (derivedPage.derivedState?.requiresAcknowledgement === false) {
        context.state = await derivedPage.refreshState(request, context)
        continue
      }
      const query = new URLSearchParams({ returnUrl: this.getHref(this.path) })
      return h.redirect(`${this.getHref(derivedPage.path)}?${query}`).code(request.method === 'post' ? 303 : 302)
    }
    return undefined
  }

  makeGetRouteHandler() {
    const handler = super.makeGetRouteHandler()
    return async (request, context, h) =>
      (await this.#refreshDerivedPages(request, context, h)) ?? handler(request, context, h)
  }

  /**
   * Replaces the engine's single land-parcels answer with the detailed parcel
   * and payment cards used by the confirm land and actions page. Older journeys
   * that store parcel references as an array retain their compact answer.
   * @param {{ details?: any[], checkAnswers?: any[] }} viewModel
   * @param {Record<string, any>} state
   * @returns {boolean} Whether the detailed land and actions summary was applied
   */
  #applyLandParcels(viewModel, state) {
    const { landParcels, payment } = state

    if (Array.isArray(landParcels) && landParcels.length) {
      this.#applyParcelReferences(viewModel, landParcels)
      return false
    }

    if (
      !landParcels ||
      Array.isArray(landParcels) ||
      typeof landParcels !== 'object' ||
      Object.keys(landParcels).length === 0
    ) {
      return false
    }

    if (!payment || !Array.isArray(viewModel.details) || !Array.isArray(viewModel.checkAnswers)) {
      return false
    }

    const landAndActionsSummary = this.#buildLandAndActionsSummary(state)

    return this.#applyLandAndActionsSummary(viewModel.details, viewModel.checkAnswers, landAndActionsSummary)
  }

  /**
   * Builds the detailed summary using saved agreement values when available.
   * @param {Record<string, any>} state
   * @returns {ReturnType<typeof buildConfirmLandAndActionsViewModel> & { changeHref: string }}
   */
  #buildLandAndActionsSummary(state) {
    const { landParcels, payment, agreementStartDate, agreementEndDate, agreementTotalPence } = state

    return {
      ...buildConfirmLandAndActionsViewModel(
        {
          ...payment,
          agreementStartDate: agreementStartDate ?? payment.agreementStartDate,
          agreementEndDate: agreementEndDate ?? payment.agreementEndDate,
          agreementTotalPence: agreementTotalPence ?? payment.agreementTotalPence
        },
        landParcels
      ),
      changeHref: this.getHref(CONFIRM_LAND_AND_ACTIONS_PATH)
    }
  }

  /**
   * Updates the compact answer used by journeys that store parcel references as an array.
   * @param {{ details?: any[], checkAnswers?: any[] }} viewModel
   * @param {any[]} landParcels
   */
  #applyParcelReferences(viewModel, landParcels) {
    const displayValue = landParcels.join(', ')
    viewModel.details?.forEach((detail, di) => {
      const ii = detail.items?.findIndex((/** @type {any} */ item) => item.name === 'landParcels') ?? -1
      if (ii !== -1 && viewModel.checkAnswers) {
        viewModel.checkAnswers[di].summaryList.rows[ii].value = { html: displayValue }
      }
    })
  }

  /**
   * Replaces matching parcel answers with the detailed summary, keeping detail items and rows aligned.
   * @param {any[]} details
   * @param {any[]} checkAnswers
   * @param {ReturnType<typeof buildConfirmLandAndActionsViewModel> & { changeHref: string }} landAndActionsSummary
   * @returns {boolean} Whether any parcel answer was replaced
   */
  #applyLandAndActionsSummary(details, checkAnswers, landAndActionsSummary) {
    const mapSelectPaths = new Set(
      (this.model?.def?.pages ?? [])
        .filter((/** @type {any} */ page) => page.controller === 'MapSelectPageController')
        .map((/** @type {any} */ page) => page.path)
    )
    let applied = false

    details.forEach((detail, di) => {
      const parcelIndex =
        detail.items?.findIndex(
          (/** @type {any} */ item) => item.name === 'landParcels' || mapSelectPaths.has(item.page?.path)
        ) ?? -1
      const checkAnswer = checkAnswers[di]

      if (parcelIndex === -1 || !checkAnswer) {
        return
      }

      detail.items = detail.items.filter((/** @type {any} */ _item, /** @type {number} */ i) => i !== parcelIndex)
      const rows = checkAnswer.summaryList?.rows ?? []
      checkAnswers[di] = {
        ...checkAnswer,
        summaryList: {
          ...checkAnswer.summaryList,
          rows: rows.filter((/** @type {any} */ _row, /** @type {number} */ i) => i !== parcelIndex)
        },
        landAndActionsSummary
      }
      applied = true
    })

    return applied
  }

  /**
   * Appends read-only summary sections configured on the page (via `config.additionalSections`),
   * populated with values already present on state that were not directly submitted by the user
   * on this journey (e.g. a payment total calculated on a previous page).
   * Entries without a title use `page` to append rows to the owning page's section.
   * @param {{ details?: any[], checkAnswers?: any[] }} viewModel
   * @param {AdditionalSection[] | undefined} additionalSections
   * @param {Record<string, any>} state
   * @param {FormContext['relevantPages']} relevantPages
   * @param {Set<string>} [excludedStateValues]
   */
  #appendAdditionalSections(viewModel, additionalSections, state, relevantPages, excludedStateValues = new Set()) {
    if (!Array.isArray(additionalSections) || !viewModel.checkAnswers) {
      return
    }

    const { checkAnswers } = viewModel
    const relevantPagePaths = new Set(relevantPages.map((page) => page.path.replace(/^\//, '')))
    const sections = this.model.sections ?? []
    const summariesBySection = new Map(
      (viewModel.details ?? []).map((detail, index) => [
        detail.items?.[0]?.page?.section ?? sections.find((candidate) => detail.name && candidate.name === detail.name),
        checkAnswers[index]
      ])
    )

    additionalSections.forEach((section) => {
      if (section.page && !relevantPagePaths.has(section.page.replace(/^\//, ''))) {
        return
      }

      const configuredItems = section.items ?? []
      const items = configuredItems.filter((item) => !excludedStateValues.has(item.stateValue))

      // The detailed land and actions summary already renders totalPayment in
      // the shared payment card, so do not add the former configured duplicate.
      if (configuredItems.length > 0 && items.length === 0) {
        return
      }

      const rows = items.map((item) => ({
        key: { text: item.title },
        value: { text: resolvePath(state, item.stateValue) ?? 'Not provided' }
      }))

      if (!section.title && section.page) {
        this.#getOwningSectionSummary(checkAnswers, section.page, summariesBySection)?.summaryList.rows.push(...rows)
        return
      }

      checkAnswers.push({
        title: { text: section.title },
        summaryList: { rows }
      })
    })
  }

  /**
   * Finds the owning section, creating an empty summary in form-section order when needed.
   * Unknown pages or section references are ignored rather than placed in an unrelated section.
   * @param {any[]} checkAnswers
   * @param {string} pagePath - Page path with or without a leading slash
   * @param {Map<import('@defra/forms-model').Section | undefined, any>} summariesBySection
   * @returns {any}
   */
  #getOwningSectionSummary(checkAnswers, pagePath, summariesBySection) {
    const ownerPage = this.model.def.pages.find((page) => page.path.replace(/^\//, '') === pagePath.replace(/^\//, ''))
    if (!ownerPage) {
      return undefined
    }

    const ownerSection = ownerPage.section ? this.model.getSection(ownerPage.section) : undefined
    if (ownerPage.section && !ownerSection) {
      return undefined
    }

    const existing = summariesBySection.get(ownerSection)
    if (existing) {
      return existing
    }

    const sectionOrder = [...(this.model.sections ?? []), undefined]
    const followingSummary = sectionOrder
      .slice(sectionOrder.indexOf(ownerSection) + 1)
      .map((section) => summariesBySection.get(section))
      .find(Boolean)
    const insertionIndex = followingSummary
      ? checkAnswers.indexOf(followingSummary)
      : Math.max(-1, ...[...summariesBySection.values()].map((summary) => checkAnswers.indexOf(summary))) + 1
    const summary = {
      title: ownerSection?.title ? { text: ownerSection.title } : undefined,
      summaryList: { rows: [] }
    }
    checkAnswers.splice(insertionIndex, 0, summary)
    summariesBySection.set(ownerSection, summary)
    return summary
  }

  /**
   * Hides check-details answers unless this summary page explicitly includes them.
   * Keep the engine's detail items and rendered rows aligned when removing answers.
   * @param {{ details?: any[], checkAnswers?: any[] }} viewModel
   */
  #excludeCheckDetailsEntries(viewModel) {
    if (this.showDetailsConfirmation || !Array.isArray(viewModel.details)) {
      return
    }

    const excludedPaths = new Set(
      (this.model?.def?.pages ?? [])
        .filter((/** @type {any} */ page) => page.controller === 'CheckDetailsController')
        .map((/** @type {any} */ page) => page.path)
    )
    if (excludedPaths.size === 0) {
      return
    }

    /** @type {any[]} */
    const keptDetails = []
    /** @type {any[]} */
    const keptCheckAnswers = []

    viewModel.details.forEach((detail, di) => {
      const items = detail.items ?? []
      const keep = items.map((/** @type {any} */ item) => !excludedPaths.has(item.page?.path))
      const filteredItems = items.filter((/** @type {any} */ _item, /** @type {number} */ i) => keep[i])
      if (filteredItems.length === 0) {
        return
      }

      keptDetails.push({ ...detail, items: filteredItems })
      const checkAnswer = viewModel.checkAnswers?.[di]
      if (checkAnswer) {
        keptCheckAnswers.push({
          ...checkAnswer,
          summaryList: {
            ...checkAnswer.summaryList,
            rows: (checkAnswer.summaryList?.rows ?? []).filter(
              (/** @type {any} */ _row, /** @type {number} */ i) => keep[i]
            )
          }
        })
      }
    })

    viewModel.details = keptDetails
    viewModel.checkAnswers = keptCheckAnswers
  }

  /**
   * Builds the view model for the page
   * @param {FormContextRequest} request
   * @param {FormContext} context
   * @returns {SummaryViewModel} The view model
   */
  getSummaryViewModel(request, context) {
    const viewModel = super.getSummaryViewModel(request, context)

    const { pageDef } = this

    const backLink = /** @type {BackLink | null} */ (getTaskPageBackLink(viewModel, pageDef))
    const sectionTitle = this.section?.hideTitle !== true ? this.section?.title : ''

    this.#excludeCheckDetailsEntries(viewModel)
    const state = /** @type {Record<string, any>} */ (/** @type {unknown} */ (context?.state ?? {}))
    const hasLandAndActionsSummary = this.#applyLandParcels(viewModel, state)
    this.#appendAdditionalSections(
      viewModel,
      this.additionalSections,
      state,
      context.relevantPages,
      hasLandAndActionsSummary ? new Set(['totalPayment']) : undefined
    )

    // SummaryViewModel is a class with a private `summaryDetails` member and does not
    // permit extra properties (`sectionTitle`), so a structural spread cannot satisfy
    // the class type even though the runtime shape is a correct superset. Cast through
    // `unknown` to keep this purely type-only with no runtime change.
    return /** @type {SummaryViewModel} */ (
      /** @type {unknown} */ ({
        ...viewModel,
        sectionTitle,
        ...(backLink ? { backLink } : {})
      })
    )
  }

  makePostRouteHandler() {
    /**
     * Refresh stale derived answers before continuing from Check answers.
     * @param {AnyFormRequest} request
     * @param {FormContext} context
     * @param {FormResponseToolkit} h
     * @returns {Promise<ResponseObject>}
     */
    const fn = async (request, context, h) => {
      return (
        (await this.#refreshDerivedPages(request, context, h)) ?? this.proceed(request, h, this.getNextPath(context))
      )
    }
    return fn
  }
}

/**
 * @typedef {object} AdditionalSectionItem
 * @property {string} title - Row label shown in the summary list
 * @property {string} stateValue - Dot-notation path to read from form state for the row value
 */

/**
 * @typedef {object} AdditionalSection
 * @property {string} [title] - Heading for a separate section; omit to use the owning page's section
 * @property {string} [page] - Applicable owning page path; also selects its section when title is omitted
 * @property {AdditionalSectionItem[]} [items] - Rows to render in this section
 */

/**
 * @typedef {object} DerivedStatePage
 * @property {string} path
 * @property {{ requiresAcknowledgement: boolean }} [derivedState]
 * @property {(request: AnyFormRequest, context: FormContext) => boolean | Promise<boolean>} [isStateStale]
 * @property {(request: AnyFormRequest, context: FormContext) => Promise<FormContext['state']>} refreshState
 */

/**
 * @import { FormContext, FormContextRequest, AnyFormRequest, FormResponseToolkit, BackLink } from '@defra/forms-engine-plugin/types'
 * @import { ResponseObject } from '@hapi/hapi'
 * @import { FormModel, SummaryViewModel } from '@defra/forms-engine-plugin/engine/models/index.js'
 * @import { PageSummary } from '@defra/forms-model'
 */

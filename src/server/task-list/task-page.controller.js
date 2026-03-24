import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { getTaskListPath, getTaskPageBackLink } from './task-list.helper.js'
import { FormAction } from '@defra/forms-engine-plugin/types'

/**
 * Controller for individual task pages (pages with a section property).
 * Overrides navigation to keep users within a section and return to task list when done.
 */
export default class TaskPageController extends QuestionPageController {
  /**
   * @param {FormModel} model
   * @param {PageQuestion} pageDef
   */
  constructor(model, pageDef) {
    super(model, pageDef)
    this.model = model
    this.pageDef = pageDef

    // Resolve section by id for V2 forms (engine only resolves by name)
    if (!this.section && pageDef.section) {
      this.section = model.sections.find((section) => section.id === pageDef.section)
    }

    // Override view name
    if (pageDef.view) {
      this.viewName = pageDef.view
    }
  }

  /**
   * Builds the view model for the task list page
   * @param {AnyFormRequest} request
   * @param {FormContext} context
   * @returns {object} The view model
   */
  getViewModel(request, context) {
    const viewModel = super.getViewModel(request, context)

    const { pageDef } = this

    const backLink = getTaskPageBackLink(viewModel, pageDef)
    const { returnAfterSection = true } = viewModel.page.def.metadata.tasklist ?? {}

    const basePath = viewModel.serviceUrl
    const taskListPath = getTaskListPath(viewModel.page.model)
    const backToTaskList = {
      href: `${basePath}${taskListPath}`,
      text: 'Back to task list'
    }

    return {
      ...viewModel,
      ...(backLink ? { backLink } : {}),
      ...(returnAfterSection ? {} : { backToTaskList })
    }
  }

  /**
   * Override to handle the task page POST request
   */
  makePostRouteHandler() {
    const parentHandler = super.makePostRouteHandler()

    return async (request, context, h) => {
      const { collection, viewName, model } = this
      const { isForceAccess, state, evaluationState } = context
      const action = request.payload.action
      if (action?.startsWith(FormAction.External)) {
        return parentHandler(request, h, context)
      }

      if (context.errors || isForceAccess) {
        const viewModel = this.getViewModel(request, context)
        viewModel.errors = collection.getViewErrors(viewModel.errors)

        // Filter our components based on their conditions using our evaluated state
        viewModel.components = this.filterConditionalComponents(viewModel, model, evaluationState)
        return h.view(viewName, viewModel)
      }

      // Save state
      await this.setState(request, state)

      // Check if this is a save-and-exit action
      if (action === FormAction.SaveAndExit) {
        return this.handleSaveAndExit(request, context, h)
      }

      // Proceed to the next page
      return this.proceed(request, h, this.getNextOrTaskPath(context))
    }
  }

  /**
   * Use the engine's default condition-aware navigation, but redirect to the
   * task list when the next page would leave the current section.
   *
   * @param {FormContext} context
   * @returns {string|undefined} The next path
   */
  getNextOrTaskPath(context) {
    const { model, pageDef } = this
    const { returnAfterSection = true } = model.def.metadata.tasklist ?? {}

    // Use the engine's default navigation (respects conditions, exit pages, etc.)
    const defaultNext = super.getNextPath(context)

    if (pageDef.section && returnAfterSection) {
      // Check if the default next page belongs to a different section.
      // If so, the current section is complete — return to the task list.
      const nextPage = defaultNext && model.pages.find((p) => p.path === defaultNext)

      if (!nextPage || (nextPage.section && nextPage.section !== this.section)) {
        return getTaskListPath(model) ?? defaultNext
      }
    }

    return defaultNext
  }
}

/**
 * @import { FormModel } from '@defra/forms-engine-plugin/engine/models/index.js'
 * @import { PageQuestion } from '@defra/forms-model'
 * @import { AnyFormRequest, FormContext } from '@defra/forms-engine-plugin/engine/types.js'
 */

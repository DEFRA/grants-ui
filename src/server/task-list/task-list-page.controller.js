import { buildTaskListData, getCompletionStats, splitComponents } from './task-list.helper.js'
import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'

export default class TaskListPageController extends QuestionPageController {
  /**
   * @param {FormModel} model
   * @param {PageQuestion} pageDef
   */
  constructor(model, pageDef) {
    super(model, pageDef)
    this.viewName = 'task-list-page.html'
  }

  /**
   * Builds the view model for the task list page
   * @param {AnyFormRequest} request
   * @param {FormContext} context
   * @returns {object} The view model
   */
  getViewModel(request, context) {
    const viewModel = super.getViewModel(request, context)
    const formModel = request.app.model
    const state = context.state ?? {}

    // Config options
    const tasklistConfig = viewModel.page.def.metadata.tasklist ?? {}

    // Build task list data from sections and pages
    const taskListSections = buildTaskListData(viewModel, formModel, state)
    const completionStats = getCompletionStats(viewModel, state)

    // Split viewModel.components into aboveComponents and belowComponents
    const [aboveComponents, belowComponents] = splitComponents(viewModel.page.collection.components)

    return {
      ...viewModel,
      taskListSections,
      completionStats,
      ...tasklistConfig,
      isComplete: completionStats.completed === completionStats.total,
      aboveComponents,
      belowComponents
    }
  }
}

/**
 * @import { FormModel } from '@defra/forms-engine-plugin/engine/models/index.js'
 * @import { PageQuestion } from '@defra/forms-model'
 * @import { AnyFormRequest, FormContext } from '@defra/forms-engine-plugin/engine/types.js'
 */

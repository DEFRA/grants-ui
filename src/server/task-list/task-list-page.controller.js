import { buildTaskListData, getCompletionStats } from './task-list.helper.js'
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

    // Build task list data from tasks and task pages
    const tasks = buildTaskListData(viewModel, formModel, state)
    const completionStats = getCompletionStats(viewModel, formModel, state)

    if (tasks.length === 1 && formModel?.sections?.[0]) {
      formModel.sections[0].hideTitle = true
    }

    // Split viewModel.components into aboveComponents and belowComponents
    const [aboveComponents, belowComponents] = splitComponents(viewModel.page.collection.components)

    return {
      ...viewModel,
      tasks,
      completionStats,
      ...tasklistConfig,
      isComplete: completionStats.completed === completionStats.total,
      aboveComponents,
      belowComponents
    }
  }
}

/**
 * Maps a component to a ViewModel component
 * @param {object} component - The component to map
 * @returns {object} The mapped ViewModel component
 */
function mapComponentToViewModelComponent(component) {
  return {
    type: component.type,
    isFormComponent: component.isFormComponent,
    model: {
      content: component.content,
      html: component.content,
      summaryHtml: component.title
    }
  }
}

/**
 * Splits components into above and below positions
 * @param {object[]} components - Array of components
 * @returns {[object[], object[]]} Array of above and below components
 */
function splitComponents(components) {
  const aboveComponents = components
    .filter((component) => component.options?.position === 'above')
    .map(mapComponentToViewModelComponent)
  const belowComponents = components
    .filter((component) => component.options?.position === 'below')
    .map(mapComponentToViewModelComponent)
  return [aboveComponents, belowComponents]
}

/**
 * @import { FormModel } from '@defra/forms-engine-plugin/engine/models/index.js'
 * @import { PageQuestion } from '@defra/forms-model'
 * @import { AnyFormRequest, FormContext } from '@defra/forms-engine-plugin/engine/types.js'
 */

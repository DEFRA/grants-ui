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
   * @param {FormContextRequest} request
   * @param {FormContext} context
   * @returns {TaskListViewModel} The view model
   */
  getViewModel(request, context) {
    const viewModel = super.getViewModel(request, context)
    const formModel = /** @type {FormModel} */ (request.app.model)
    const state = context.state ?? {}

    // Config options
    const tasklistConfig =
      /** @type {{ tasklist?: object } | undefined} */ (viewModel.page.def.metadata)?.tasklist ?? {}

    // Build task list data from tasks and task pages
    const tasks = buildTaskListData(viewModel, formModel, state)
    const completionStats = getCompletionStats(viewModel, formModel, state)

    if (tasks.length === 1 && formModel?.sections?.[0]) {
      formModel.sections[0].hideTitle = true
    }

    // Split viewModel.components into aboveComponents and belowComponents
    const [aboveComponents, belowComponents] = splitComponents(viewModel.page.collection?.components ?? [])

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
 * @param {Component} component - The component to map
 * @returns {MappedViewModelComponent} The mapped ViewModel component
 */
function mapComponentToViewModelComponent(component) {
  const content = /** @type {{ content?: string }} */ (component).content
  return {
    type: component.type,
    isFormComponent: component.isFormComponent,
    model: {
      content,
      html: content,
      summaryHtml: component.title
    }
  }
}

/**
 * Splits components into above and below positions
 * @param {Component[]} components - Array of components
 * @returns {[MappedViewModelComponent[], MappedViewModelComponent[]]} Array of above and below components
 */
function splitComponents(components) {
  const aboveComponents = components
    .filter((component) => /** @type {{ options?: { position?: string } }} */ (component).options?.position === 'above')
    .map(mapComponentToViewModelComponent)
  const belowComponents = components
    .filter((component) => /** @type {{ options?: { position?: string } }} */ (component).options?.position === 'below')
    .map(mapComponentToViewModelComponent)
  return [aboveComponents, belowComponents]
}

/**
 * @import { FormModel } from '@defra/forms-engine-plugin/engine/models/index.js'
 * @import { PageQuestion } from '@defra/forms-model'
 * @import { FormContext, FormContextRequest, FormPageViewModel } from '@defra/forms-engine-plugin/engine/types.js'
 * @import { Component } from '@defra/forms-engine-plugin/engine/components/helpers/components.js'
 * @import { Task } from './task-list.helper.js'
 */

/**
 * @typedef {object} MappedViewModelComponent
 * @property {string} [type]
 * @property {boolean} [isFormComponent]
 * @property {{ content?: string, html?: string, summaryHtml?: string }} model
 */

/**
 * @typedef {FormPageViewModel & {
 *   tasks: Task[]
 *   completionStats: { completed: number, total: number, isComplete: boolean }
 *   isComplete: boolean
 *   aboveComponents: MappedViewModelComponent[]
 *   belowComponents: MappedViewModelComponent[]
 * }} TaskListViewModel
 */

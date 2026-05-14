/**
 * @import { FormModel } from '@defra/forms-engine-plugin/engine/models/index.js'
 */

/**
 * @typedef {object} TaskItem
 * @property {string} title - The task or task page title
 * @property {string} href - The path to the task page
 * @property {object} status - The status object for GOV.UK Task List component
 * @property {string} [status.text] - Status text (e.g., "Completed", "Not yet started")
 * @property {string} [status.tag] - Tag configuration if using a tag
 */

/**
 * @typedef {object} Task
 * @property {string} title - The task title
 * @property {Array<TaskItem>} items - The task pages/questions for this task
 */

import TaskListPageController from '~/src/server/task-list/task-list-page.controller.js'

/**
 * Component types that store a user answer in state (question types), as opposed
 * to display-only guidance components. Used to decide which pages count as tasks
 * and which component drives a task's title.
 */
const QUESTION_COMPONENT_TYPES = new Set([
  'TextField',
  'EmailAddressField',
  'TelephoneNumberField',
  'NumberField',
  'MultilineTextField',
  'DatePartsField',
  'MonthYearField',
  'RadiosField',
  'CheckboxesField',
  'SelectField',
  'AutocompleteField',
  'YesNoField',
  'UkAddressField',
  'FileUploadField',
  'EastingNorthingField',
  'LatLongField',
  'OsGridRefField',
  'NationalGridFieldNumberField',
  'GeospatialField',
  'HiddenField'
])

/**
 * Status key constants for task status comparisons.
 */
export const TASK_STATUS = Object.freeze({
  completed: 'completed',
  inProgress: 'inProgress',
  notStarted: 'notStarted',
  cannotStart: 'cannotStart',
  cannotContinue: 'cannotContinue'
})

/**
 * Default status configurations for the GOV.UK Task List component.
 * Each entry maps a status key to its default label and CSS tag class.
 * These can be overridden via metadata.tasklist.statuses in the form YAML.
 */
export const TASK_STATUS_CONFIG = Object.freeze({
  [TASK_STATUS.completed]: {
    text: 'Completed',
    classes: 'govuk-tag--green'
  },
  [TASK_STATUS.inProgress]: {
    text: 'In progress',
    classes: 'govuk-tag--blue'
  },
  [TASK_STATUS.notStarted]: {
    text: 'Not started',
    classes: 'govuk-tag--yellow'
  },
  [TASK_STATUS.cannotStart]: {
    text: 'Cannot start yet',
    classes: 'govuk-tag--grey'
  },
  [TASK_STATUS.cannotContinue]: {
    text: 'On hold',
    classes: 'govuk-tag--purple'
  }
})

/**
 * Evaluates a named condition from the form model against the current state.
 * Returns false if the condition is not found or the model is unavailable.
 * @param {object|undefined} formModel
 * @param {string} conditionName
 * @param {object} state
 * @returns {boolean}
 */
function evaluateCondition(formModel, conditionName, state) {
  const condition = formModel?.conditions[conditionName]
  return condition ? formModel.makeCondition(condition).fn(state) : false
}

/**
 * Gets the names of all required question components on a page
 * @param {object} pageDef - The page definition from YAML
 * @returns {string[]} Array of required component names that hold state
 */
function getPageComponentNames(pageDef) {
  if (!pageDef.components) {
    return []
  }

  return pageDef.components
    .filter((component) => QUESTION_COMPONENT_TYPES.has(component.type) && component.options?.required !== false)
    .map((component) => component.name)
    .filter(Boolean)
}

/**
 * Determines if a task page is completed based on state
 * @param {object} pageDef - The page definition
 * @param {object} state - The current form state
 * @param formModel
 * @returns {boolean | null} True if all question components on the page have values in state, null if not applicable
 */
function isTaskPageCompleted(pageDef, state, formModel) {
  const componentNames = getPageComponentNames(pageDef)

  // If no question components, consider it not applicable (shouldn't appear as task)
  if (componentNames.length === 0) {
    return false
  }

  if (pageDef.condition && !evaluateCondition(formModel, pageDef.condition, state)) {
    return null // Hide task as it is not applicable
  }

  // Check if all components have a value in state (unless required=false)
  const allAnswered = componentNames.every((name) => {
    // Check if the exact name exists
    const value = state[name]
    if (value !== undefined && value !== null && value !== '') {
      return true
    }

    // Check if any subfield exists (name__subfield pattern)
    return Object.keys(state).some((key) => key.startsWith(`${name}__`))
  })

  return allAnswered
}

/**
 * Checks if a task page's answers trigger a following exit (terminal) page condition.
 * Exit pages follow their task page in the definition and have controller: TerminalPageController.
 * @param {object} pageDef - The task page definition
 * @param {object} state - The current form state
 * @param {object} formModel - The form model
 * @returns {boolean} True if an exit page condition is triggered
 */
function triggersExitPage(pageDef, state, formModel) {
  const allPages = formModel.def.pages
  const currentIndex = allPages.findIndex((p) => p.path === pageDef.path)

  // Look at pages following this one until we hit the next task page
  for (let i = currentIndex + 1; i < allPages.length; i++) {
    const nextPage = allPages[i]

    // Stop when we hit a page with a section property (next task page)
    if (nextPage.section) {
      break
    }

    // Check if this is a terminal/exit page with a condition that evaluates to true
    if (
      nextPage.controller === 'TerminalPageController' &&
      nextPage.condition &&
      evaluateCondition(formModel, nextPage.condition, state)
    ) {
      return true
    }
  }

  return false
}

/**
 * Gets the display title for a task in the task list.
 * Uses the first question component's shortDescription if available, otherwise the page title.
 * @param {object} pageDef - The page definition
 * @returns {string} The title to display in the task list
 */
function getTaskTitle(pageDef) {
  const questionComponents = pageDef.components?.filter((c) => QUESTION_COMPONENT_TYPES.has(c.type)) ?? []
  if (questionComponents.length === 1) {
    return questionComponents[0].shortDescription ?? pageDef.title
  }
  return pageDef.title
}

/**
 * Creates a task item base structure with title
 * @param {string} title - The page title
 * @returns {object} Base task item structure
 */
function createTaskItemBase(title) {
  return {
    title: {
      text: title
    }
  }
}

/**
 * Creates a status tag with default values
 * @param {object} statusConfig - Status configuration from metadata
 * @param {{ text: string, classes: string }} defaults - Default status text and CSS classes
 * @returns {object} Status tag configuration
 */
function createStatusTag(statusConfig, defaults) {
  return {
    tag: {
      text: statusConfig?.text ?? defaults.text,
      classes: statusConfig?.classes ?? defaults.classes
    }
  }
}

/**
 * Checks if all previous tasks in the list are completed
 * @param {object[]} pages - Array of page definitions
 * @param {object} currentPage - The current page definition
 * @param {object} state - The current form state
 * @param formModel
 * @returns {boolean} True if all previous tasks are completed or not applicable
 */
function areAllPreviousTasksCompleted(pages, currentPage, state, formModel) {
  const currentIndex = pages.indexOf(currentPage)
  return pages.slice(0, currentIndex).every((prevPage) => {
    if (isTaskPageCompleted(prevPage, state, formModel) === false) {
      return false
    }
    // Block if a previous task's answer triggers an exit page
    if (formModel && triggersExitPage(prevPage, state, formModel)) {
      return false
    }
    return true
  })
}

/**
 * Create task item object for a page
 * @param {object} pageDef - The page definition
 * @param {object} state - The current form state
 * @param {object[]} pages - Array of page definitions
 * @param {object} metadata - Form metadata
 * @param {string} basePath - Base path for the service, used to build task links
 * @param formModel
 * @returns {object} Task Item object for GOV.UK Task List component
 */
function createTaskItem(pageDef, state, pages, metadata, basePath, formModel) {
  const completed = isTaskPageCompleted(pageDef, state, formModel)
  const { statuses = {} } = metadata.tasklist ?? {}
  const href = `${basePath}${pageDef.path}`
  const completeInOrder = true // TODO force to true for now until completeInOrder=false logic implemented

  const taskItem = createTaskItemBase(getTaskTitle(pageDef))

  // If task is not applicable, hide it
  if (completed === null) {
    return null
  }

  if (completed) {
    taskItem.href = href
    taskItem.status = createStatusTag(statuses.completed, TASK_STATUS_CONFIG.completed)
    return taskItem
  }

  const pageIndex = pages.indexOf(pageDef)
  if (
    completeInOrder &&
    pages.includes(pageDef) &&
    pageIndex > 0 &&
    !areAllPreviousTasksCompleted(pages, pageDef, state, formModel)
  ) {
    taskItem.status = createStatusTag(statuses.cannotStart, TASK_STATUS_CONFIG.cannotStart)
    return taskItem
  }

  taskItem.href = href
  taskItem.status = createStatusTag(statuses.notStarted, TASK_STATUS_CONFIG.notStarted)
  return taskItem
}

/**
 * Finds the task list page path from the model
 * @param {object} model - The form model
 * @returns {string|undefined} The path to the task list page, or undefined if not found
 */
export function getTaskListPath(model) {
  const taskListPage = model.pages.find((page) => page instanceof TaskListPageController)
  return taskListPage?.path ?? undefined
}

/**
 * Gets all pages that belong to a task
 * @param {object} model - The form model
 * @returns {object[]} Array of page definitions that have a section property
 */
function getTaskPages(model) {
  const excludedControllers = new Set(['CheckDetailsController', 'TerminalPageController'])
  return model.page.def.pages.filter((page) => page.section && !excludedControllers.has(page.controller))
}

/**
 * Builds the task map from the model definition
 * @param {object} model - The form model
 * @returns {Map<string, string>} Map of section id to section (task) title
 */
function getTaskMap(model) {
  const taskMap = new Map()

  if (model.page.def.sections) {
    for (const section of model.page.def.sections) {
      taskMap.set(section.id, section.title)
    }
  }

  return taskMap
}

/**
 * Checks if all task pages before the given index are completed.
 * @param {number} taskIndex - The index of the current task
 * @param {object[][]} orderedTaskPages - All task page groups in order
 * @param {object} state - The current form state
 * @param {object} formModel - The form model
 * @returns {boolean} True if all previous tasks are completed
 */
function arePreviousTaskPagesCompleted(taskIndex, orderedTaskPages, state, formModel) {
  for (let i = 0; i < taskIndex; i++) {
    const prevPages = orderedTaskPages[i]
    const prevApplicablePages = prevPages.filter((pageDef) => isTaskPageCompleted(pageDef, state, formModel) !== null)
    const prevAllCompleted = prevApplicablePages.every((page) => isTaskPageCompleted(page, state, formModel) === true)
    if (!prevAllCompleted) {
      return false
    }
  }
  return true
}

/**
 * Determines the status of a task when showQuestions is false.
 * Status is based on all task pages belonging to that task.
 * @param {string} sectionId - The section id
 * @param {object[][]} orderedTaskPages - All task page groups in order [[pages], ...]
 * @param {string[]} orderedTaskIds - Task ids in order
 * @param {object} state - The current form state
 * @param {object} formModel - The form model
 * @returns {keyof typeof TASK_STATUS} The task status
 */
function getTaskStatus(sectionId, orderedTaskIds, orderedTaskPages, state, formModel) {
  const taskIndex = orderedTaskIds.indexOf(sectionId)
  const pages = orderedTaskPages[taskIndex]

  // Only consider applicable pages (not conditionally excluded ones)
  const applicablePages = pages.filter((page) => isTaskPageCompleted(page, state, formModel) !== null)
  const completedPages = applicablePages.filter((page) => isTaskPageCompleted(page, state, formModel) === true)

  const previousTasksComplete = arePreviousTaskPagesCompleted(taskIndex, orderedTaskPages, state, formModel)

  if (applicablePages.length === 0 || completedPages.length === applicablePages.length) {
    // Task is complete, but if a previous task is now incomplete, block access
    return previousTasksComplete ? TASK_STATUS.completed : TASK_STATUS.cannotContinue
  }
  if (completedPages.length > 0) {
    // Task is in progress, but if a previous task is now incomplete, block access
    return previousTasksComplete ? TASK_STATUS.inProgress : TASK_STATUS.cannotContinue
  }

  // Task not started - block if any previous task is incomplete
  return previousTasksComplete ? TASK_STATUS.notStarted : TASK_STATUS.cannotStart
}

/**
 * Builds the task list data structure when showQuestions is false.
 * Each task is displayed as a single task item (not individual question pages).
 * @param {object} model - The form model
 * @param {object} formModel - The form model from the session store
 * @param {object} state - The current form state
 * @returns {Task[]} Array with a single task
 */
function buildTaskListDataHideQuestions(model, formModel, state) {
  const taskPages = getTaskPages(model)
  const taskMap = getTaskMap(model)
  const basePath = model.serviceUrl
  const { statuses = {} } = formModel.def.metadata.tasklist ?? {}

  // Group pages by task/section, maintaining order from YAML
  const taskGroups = new Map()
  for (const page of taskPages) {
    const sectionId = page.section
    if (!taskGroups.has(sectionId)) {
      taskGroups.set(sectionId, [])
    }
    taskGroups.get(sectionId).push(page)
  }

  const orderedTaskIds = [...taskGroups.keys()]
  const orderedTaskPages = orderedTaskIds.map((id) => taskGroups.get(id))

  const items = orderedTaskIds.map((sectionId, index) => {
    const taskTitle = taskMap.get(sectionId) ?? ''
    const pages = orderedTaskPages[index]
    const status = getTaskStatus(sectionId, orderedTaskIds, orderedTaskPages, state, formModel)

    // For inProgress, link to last page so forms-engine-plugin redirects to first unanswered question
    // For notStarted or completed, link to first page
    const firstPagePath = pages[0]?.path
    const lastPagePath = pages[pages.length - 1]?.path
    const hrefPath = status === TASK_STATUS.inProgress ? lastPagePath : firstPagePath
    const href = hrefPath ? `${basePath}${hrefPath}` : undefined

    const taskItem = createTaskItemBase(taskTitle)

    if (status === TASK_STATUS.completed) {
      taskItem.href = href
      taskItem.status = createStatusTag(statuses.completed, TASK_STATUS_CONFIG.completed)
    } else if (status === TASK_STATUS.inProgress) {
      taskItem.href = href
      taskItem.status = createStatusTag(statuses.inProgress, TASK_STATUS_CONFIG.inProgress)
    } else if (status === TASK_STATUS.cannotStart) {
      taskItem.status = createStatusTag(statuses.cannotStart, TASK_STATUS_CONFIG.cannotStart)
    } else if (status === TASK_STATUS.cannotContinue) {
      taskItem.status = createStatusTag(statuses.cannotContinue, TASK_STATUS_CONFIG.cannotContinue)
    } else {
      taskItem.href = href
      taskItem.status = createStatusTag(statuses.notStarted, TASK_STATUS_CONFIG.notStarted)
    }

    return taskItem
  })

  return [{ title: '', items }]
}

/**
 * Builds the task list data structure for the GOV.UK Task List component
 * @param {object} model - The form model
 * @param {FormModel} formModel - The form model from the session store, used to build task links
 * @param {object} state - The current form state
 * @returns {Task[]} Array of tasks with their task pages
 */
export function buildTaskListData(model, formModel, state) {
  const { showQuestions = true } =
    /** @type {{ tasklist?: { showQuestions?: boolean } }} */ (formModel.def.metadata).tasklist ?? {}

  if (!showQuestions) {
    return buildTaskListDataHideQuestions(model, formModel, state)
  }

  const taskPages = getTaskPages(model)
  const taskMap = getTaskMap(model)
  const basePath = model.serviceUrl
  const metadata = formModel.def.metadata

  // Group pages by task, maintaining order from YAML
  const taskGroups = new Map()

  for (const page of taskPages) {
    const sectionId = page.section
    if (!taskGroups.has(sectionId)) {
      taskGroups.set(sectionId, [])
    }
    taskGroups.get(sectionId).push(page)
  }

  // Build the task list
  const tasks = []

  for (const [sectionId, pages] of taskGroups) {
    const taskTitle = taskMap.get(sectionId) ?? ''

    const items = pages
      .map((page) => ({
        ...createTaskItem(page, state, taskPages, metadata, basePath, formModel)
      }))
      .filter((p) => p.status)

    tasks.push({
      title: taskTitle,
      items
    })
  }

  return tasks
}

/**
 * Calculates completion statistics for the task list
 * @param {object} model - The form model
 * @param {FormModel} formModel - The form model from the session store
 * @param {object} state - The current form state
 * @returns {{ completed: number, total: number, isComplete: boolean }} Completion stats
 */
export function getCompletionStats(model, formModel, state) {
  const taskPages = getTaskPages(model)

  const applicablePages = taskPages.filter((page) => isTaskPageCompleted(page, state, formModel) !== null)
  const completed = applicablePages.filter((page) => isTaskPageCompleted(page, state, formModel) === true).length
  const total = applicablePages.length

  return { completed, total, isComplete: completed === total }
}

/**
 * Finds the next task page for this task after the current task page.
 * Stops searching when hitting a task page with a different section property.
 * @param {object[]} pages - All pages in the form
 * @param {number} startIndex - Index to start searching from (exclusive)
 * @param {string} section - The section to match
 * @returns {object|undefined} The next page in the same section, or undefined
 */
function findNextTaskPage(pages, startIndex, section) {
  const remainingPages = pages.slice(startIndex + 1)

  for (const page of remainingPages) {
    if (page.section?.id === section) {
      return page
    }
    // Stop if we hit a page with a different section
    if (page.section?.id && page.section?.id !== section) {
      return undefined
    }
  }

  return undefined
}

/**
 * Determines if there is a next task page for this task after the current task page.
 * @param {object} model - The form model
 * @param {object} currentPage - The current page definition
 * @returns {boolean} True if there is a next task page for this task, false otherwise
 */
export function hasNextTaskPage(model, currentPage) {
  const allPages = model.page.def.pages
  const currentIndex = allPages.findIndex((p) => p.path === currentPage.path)

  const nextPageForTask = findNextTaskPage(allPages, currentIndex, currentPage.section)

  return nextPageForTask !== undefined
}

/**
 * Determines the next page path after completing a task page.
 * If there's another task page for this task, go there.
 * Otherwise, return to the task list.
 * @param {object} model - The form model
 * @param {object} currentPage - The current page definition
 * @returns {string|undefined} The next path to navigate to
 */
export function getNextTaskPath(model, currentPage) {
  const allPages = model.pages
  const currentIndex = allPages.findIndex((p) => p.path === currentPage.path)

  const nextPageForTask = findNextTaskPage(allPages, currentIndex, currentPage.section)

  if (nextPageForTask) {
    return nextPageForTask.path
  }

  return getTaskListPath(model)
}

/**
 * Determine backLink for task page
 * If first task page for task, return to task list using getTaskListPath
 * Otherwise, return null to fallback to default forms-engine-plugin behaviour
 * @param {object} viewModel - The view model
 * @param {object} currentPage - The current page definition
 * @param {boolean} [hasReturnUrl=false] - Whether a returnUrl query parameter was provided
 * @returns {object|null} Back link object or null
 */
export function getTaskPageBackLink(viewModel, currentPage, hasReturnUrl = false) {
  const allTaskPages = getTaskPages(viewModel)
  const firstTaskPage = allTaskPages.find((page) => page.section === currentPage.section)
  const isFirstTaskPage = firstTaskPage?.path === currentPage.path
  const { returnAfterSection = true } = viewModel.page.def.metadata.tasklist ?? {}

  if (isFirstTaskPage && returnAfterSection && !hasReturnUrl) {
    const basePath = viewModel.serviceUrl
    const taskListPath = getTaskListPath(viewModel.page.model)
    return {
      href: `${basePath}${taskListPath}`,
      text: 'Back to task list'
    }
  }

  return null
}

/**
 * Mixin that adds task-list navigation behaviour to any controller class.
 *
 * Usage:
 *   class MyController extends withTaskContext(QuestionPageController) { ... }
 *
 * @template {new (...args: any[]) => any} T
 * @param {T} Base
 */
export function withTaskContext(Base) {
  return class TaskContextMixin extends Base {
    /**
     * Wraps the parent's view-model builder to add back-link / back-to-task-list.
     * Works whether the parent exposes `getViewModel` or `buildViewModel`.
     */
    getViewModel(request, context) {
      const viewModel = super.getViewModel(request, context)
      return applyTaskPageViewModel(viewModel, this.pageDef, !!request.query.returnUrl)
    }

    /**
     * Same wrapper for controllers that use `buildViewModel` instead of `getViewModel`.
     */
    buildViewModel(request, context, overrides) {
      const viewModel = super.buildViewModel(request, context, overrides)
      return applyTaskPageViewModel(viewModel, this.pageDef, !!request.query.returnUrl)
    }

    /**
     * Override proceed to apply task-list redirect logic after a POST.
     */
    proceed(request, h, nextPath) {
      const { model, pageDef } = this
      const { returnAfterSection = true } = model.def.metadata.tasklist ?? {}

      if (pageDef.section && returnAfterSection) {
        // Check if the default next page belongs to a different section.
        // If so, the current section is complete — return to the task list.
        const nextPage = nextPath && model.pages.find((p) => p.path === nextPath)

        if (!nextPage || (nextPage.section && nextPage.section !== this.section)) {
          return super.proceed(request, h, getTaskListPath(model) ?? nextPath)
        }
      }

      return super.proceed(request, h, nextPath)
    }
  }
}

/**
 * Applies task-list additions to an already-built view model.
 * @param {object} viewModel
 * @param {object} pageDef
 * @param {boolean} [hasReturnUrl=false] - Whether a returnUrl query parameter was provided
 */
function applyTaskPageViewModel(viewModel, pageDef, hasReturnUrl = false) {
  const backLink = getTaskPageBackLink(viewModel, pageDef, hasReturnUrl)
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

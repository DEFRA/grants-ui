/**
 * @typedef {object} TaskItem
 * @property {string} title - The task title (page title)
 * @property {string} href - The path to the task page
 * @property {object} status - The status object for GOV.UK Task List component
 * @property {string} [status.text] - Status text (e.g., "Completed", "Not yet started")
 * @property {string} [status.tag] - Tag configuration if using a tag
 */

/**
 * @typedef {object} TaskListSection
 * @property {string} title - The section title
 * @property {Array<TaskItem>} items - The tasks in this section
 */

import TaskListPageController from '~/src/server/task-list/task-list-page.controller.js'

/**
 * Gets the names of all required question components on a page
 * @param {object} pageDef - The page definition from YAML
 * @returns {string[]} Array of required component names that hold state
 */
function getPageComponentNames(pageDef) {
  if (!pageDef.components) {
    return []
  }

  // Components that store answers in state (question types)
  const questionComponentTypes = [
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
    'FileUploadField'
  ]

  return pageDef.components
    .filter((component) => questionComponentTypes.includes(component.type) && component.options?.required !== false)
    .map((component) => component.name)
    .filter(Boolean)
}

/**
 * Determines if a task (page) is completed based on state
 * @param {object} pageDef - The page definition
 * @param {object} state - The current form state
 * @returns {boolean} True if all question components on the page have values in state
 */
function isTaskCompleted(pageDef, state) {
  const componentNames = getPageComponentNames(pageDef)

  // If no question components, consider it not applicable (shouldn't appear as task)
  if (componentNames.length === 0) {
    return false
  }

  // Check if all components have a value in state (unless required=false)
  return componentNames.every((name) => {
    // Check if the exact name exists
    const value = state[name]
    if (value !== undefined && value !== null && value !== '') {
      return true
    }

    // Check if any subfield exists (name__subfield pattern)
    return Object.keys(state).some((key) => key.startsWith(`${name}__`))
  })
}

/**
 * Gets the task status object for a page
 * @param {object} pageDef - The page definition
 * @param {object} state - The current form state
 * @param {object[]} pages - Array of page definitions
 * @param {object} metadata - Form metadata
 * @param {string} basePath - Base path for the service, used to build task links
 * @returns {object} Status object for GOV.UK Task List component
 */
function getTaskStatus(pageDef, state, pages, metadata, basePath) {
  const completed = isTaskCompleted(pageDef, state)
  const { statuses = {} } = metadata.tasklist ?? {}
  const completeInOrder = true // TODO force to true for now until completeInOrder=false logic implemented

  if (completed) {
    return {
      href: `${basePath}${pageDef.path}`,
      status: {
        tag: {
          text: statuses.completed?.text ?? 'Completed',
          classes: statuses.completed?.classes ?? 'govuk-tag--green'
        }
      }
    }
  }

  if (completeInOrder && pages.indexOf(pageDef) > 0) {
    const currentIndex = pages.indexOf(pageDef)
    const allPreviousCompleted = pages.slice(0, currentIndex).every((prevPage) => isTaskCompleted(prevPage, state))

    if (!allPreviousCompleted) {
      return {
        status: {
          tag: {
            text: statuses?.cannotStart?.text ?? 'Cannot start yet',
            classes: statuses?.cannotStart?.classes ?? 'govuk-tag--grey'
          }
        }
      }
    }
  }

  return {
    href: `${basePath}${pageDef.path}`,
    status: {
      tag: {
        text: statuses.notStarted?.text ?? 'Not started',
        classes: statuses.notStarted?.classes ?? 'govuk-tag--blue'
      }
    }
  }
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
 * Gets all pages that belong to a section (i.e., are tasks)
 * @param {object} model - The form model
 * @returns {object[]} Array of page definitions that have a section
 */
function getTaskPages(model) {
  return model.page.def.pages.filter((page) => page.section)
}

/**
 * Builds the sections map from the model definition
 * @param {object} model - The form model
 * @returns {Map<string, string>} Map of section name to section title
 */
function getSectionsMap(model) {
  const sectionsMap = new Map()

  if (model.page.def.sections) {
    for (const section of model.page.def.sections) {
      sectionsMap.set(section.name, section.title)
    }
  }

  return sectionsMap
}

/**
 * Builds the task list data structure for the GOV.UK Task List component
 * @param {object} model - The form model
 * @param {object} formModel - The form model from the session store, used to build task links
 * @param {object} state - The current form state
 * @returns {TaskListSection[]} Array of sections with their tasks
 */
export function buildTaskListData(model, formModel, state) {
  const taskPages = getTaskPages(model)
  const sectionsMap = getSectionsMap(model)
  const basePath = model.serviceUrl
  const metadata = formModel.def.metadata

  // Group pages by section, maintaining order from YAML
  const sectionGroups = new Map()

  for (const page of taskPages) {
    const sectionName = page.section
    if (!sectionGroups.has(sectionName)) {
      sectionGroups.set(sectionName, [])
    }
    sectionGroups.get(sectionName).push(page)
  }

  // Build the task list sections
  const taskListSections = []

  for (const [sectionName, pages] of sectionGroups) {
    const sectionTitle = sectionsMap.get(sectionName) ?? sectionName

    const items = pages.map((page) => ({
      title: {
        text: page.title
      },
      ...getTaskStatus(page, state, taskPages, metadata, basePath)
    }))

    taskListSections.push({
      title: sectionTitle,
      items
    })
  }

  return taskListSections
}

/**
 * Calculates completion statistics for the task list
 * @param {object} model - The form model
 * @param {object} state - The current form state
 * @returns {{ completed: number, total: number, isComplete: boolean }} Completion stats
 */
export function getCompletionStats(model, state) {
  const taskPages = getTaskPages(model)

  const completed = taskPages.filter((page) => isTaskCompleted(page, state)).length
  const total = taskPages.length

  return { completed, total, isComplete: completed === total }
}

/**
 * Finds the next page in the same section after the current page.
 * Stops searching when hitting a page with a different section.
 * @param {object[]} pages - All pages in the form
 * @param {number} startIndex - Index to start searching from (exclusive)
 * @param {string} section - The section to match
 * @returns {object|undefined} The next page in the same section, or undefined
 */
function findNextPageInSection(pages, startIndex, section) {
  const remainingPages = pages.slice(startIndex + 1)

  for (const page of remainingPages) {
    if (page.section?.name === section) {
      return page
    }
    // Stop if we hit a page with a different section
    if (page.section?.name && page.section?.name !== section) {
      return undefined
    }
  }

  return undefined
}

/**
 * Determines if there is a next page in the section after the current page.
 * @param {object} model - The form model
 * @param {object} currentPage - The current page definition
 * @returns {boolean} True if there is a next page in the section, false otherwise
 */
export function hasNextPageInSection(model, currentPage) {
  const allPages = model.page.def.pages
  const currentIndex = allPages.findIndex((p) => p.path === currentPage.path)

  const nextPageInSection = findNextPageInSection(allPages, currentIndex, currentPage.section)

  return nextPageInSection !== undefined
}

/**
 * Determines the next page path after completing a task page.
 * If there's another page in the same section, go there.
 * Otherwise, return to the task list.
 * @param {object} model - The form model
 * @param {object} currentPage - The current page definition
 * @returns {string|undefined} The next path to navigate to
 */
export function getNextTaskPath(model, currentPage) {
  const allPages = model.pages
  const currentIndex = allPages.findIndex((p) => p.path === currentPage.path)

  const nextPageInSection = findNextPageInSection(allPages, currentIndex, currentPage.section)

  if (nextPageInSection) {
    return nextPageInSection.path
  }

  return getTaskListPath(model)
}

/**
 * Determine backLink for task page
 * If first page in section, return to task list using getTaskListPath
 * Otherwise, return null to fallback to default DXT behaviour
 * @param {object} viewModel - The view model
 * @param {object} currentPage - The current page definition
 * @returns {object|null} Back link object or null
 */
export function getTaskPageBackLink(viewModel, currentPage) {
  const taskPages = getTaskPages(viewModel)
  const pagesInSection = taskPages.filter((page) => page.section === currentPage.section)
  const isFirstPageInSection = pagesInSection[0]?.path === currentPage.path
  const { returnAfterSection = true } = viewModel.page.def.metadata.tasklist ?? {}

  if (isFirstPageInSection && returnAfterSection) {
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
 * Splits components into above and below positions
 * @param {object[]} components - Array of components
 * @returns {[object[], object[]]} Array of above and below components
 */
export function splitComponents(components) {
  const aboveComponents = components
    .filter((component) => component.options?.position === 'above')
    .map(mapComponentToViewModelComponent)
  const belowComponents = components
    .filter((component) => component.options?.position === 'below')
    .map(mapComponentToViewModelComponent)
  return [aboveComponents, belowComponents]
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

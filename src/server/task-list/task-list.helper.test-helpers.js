import TaskListPageController from './task-list-page.controller.js'

// Component types that store answers in state (question types).
// The forms-engine collection.fields only contains these, excluding guidance
// components such as Html, so we replicate that filtering when building a pageMap.
export const QUESTION_COMPONENT_TYPES = new Set([
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
  'NationalGridFieldNumberField'
])

/**
 * Builds a formModel.pageMap from a list of page definitions, mirroring the
 * forms-engine structure the helper now reads via
 * formModel.pageMap.get(path).collection.fields
 * @param {object[]} [pages]
 * @returns {Map<string, { collection: { fields: object[] } }>}
 */
export function buildPageMap(pages = []) {
  const pageMap = new Map()
  pages.forEach((page, index) => {
    if (page.path === undefined) {
      page.path = `/__auto_page_${index}`
    }
    const fields = (page.components ?? []).filter((component) => QUESTION_COMPONENT_TYPES.has(component.type))
    pageMap.set(page.path, { collection: { fields } })
  })
  return pageMap
}

/**
 * Builds a TaskListPageController for tests. The constructor doesn't retain
 * the path, so this helper re-assigns it after construction.
 * @param {string} [path]
 * @returns {TaskListPageController}
 */
export function makeTaskListPageController(path = '/task-list') {
  const controller = new TaskListPageController({}, { path })
  controller.path = path
  return controller
}

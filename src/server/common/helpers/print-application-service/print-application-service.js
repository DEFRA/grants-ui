import { formatAnswer } from './utils/format-answer.js'
import { COMPONENT_TYPES, DISPLAY_ONLY_TYPES } from './constants.js'
import { buildConfirmLandAndActionsViewModel } from '~/src/server/land-grants/view-models/confirm-land-and-actions.view-model.js'
import { ComponentsRegistry } from '../../../confirmation/services/components.registry.js'

export const COMPOSITE_FIELD_PARTS = {
  [COMPONENT_TYPES.DatePartsField]: ['day', 'month', 'year'],
  [COMPONENT_TYPES.MonthYearField]: ['month', 'year'],
  [COMPONENT_TYPES.UkAddressField]: ['addressLine1', 'addressLine2', 'town', 'county', 'postcode'],
  [COMPONENT_TYPES.EastingNorthingField]: ['easting', 'northing'],
  [COMPONENT_TYPES.LatLongField]: ['latitude', 'longitude']
}

/**
 * @import { PaymentCalculation } from '~/src/server/land-grants/types/payment.d.js'
 * @import { LandParcels } from '~/src/server/land-grants/types/form-state.d.js'
 */

/**
 * @typedef {{ text: string, value: string | number | boolean }} ListItem
 * @typedef {{ type: string, name: string, title: string, shortDescription?: string, list?: string, items?: ListItem[] }} FormComponent
 * @typedef {{ title: string, section?: string, controller?: string, components?: FormComponent[] }} FormPage
 * @typedef {{
 *   pages?: FormPage[],
 *   sections?: { id?: string, title: string }[],
 *   metadata?: {
 *     printPage?: {
 *       includeApplicationInTitle?: boolean
 *     }
 *   }
 * }} FormDefinition
 * @typedef {{ title: string, path?: string, slug: string, id: string}} FormMeta
 * @typedef {Record<string, unknown>} Answers
 */

/**
 * Checks whether a component should produce a question row.
 * @param {FormComponent} component
 * @returns {boolean}
 */
function isAnswerableComponent(component) {
  return !DISPLAY_ONLY_TYPES.has(component.type) && !component.name?.startsWith('$$')
}

/**
 * Resolves the answer for a component from the answers object.
 * Composite fields (DatePartsField, MonthYearField, UkAddressField) store
 * values as flat keys with __ separators (e.g. name__day, name__month).
 * This function reassembles them into nested objects for the formatters.
 * @param {FormComponent} component
 * @param {Answers} answers
 * @returns {unknown}
 */
function resolveAnswer(component, answers) {
  if (answers[component.name] !== undefined) {
    return answers[component.name]
  }

  const parts = COMPOSITE_FIELD_PARTS[component.type]
  if (!parts) {
    return undefined
  }

  /** @type {Record<string, unknown>} */
  const assembled = {}
  let hasValue = false

  for (const part of parts) {
    const key = `${component.name}__${part}`
    if (answers[key] !== undefined && answers[key] !== null && answers[key] !== '') {
      assembled[part] = answers[key]
      hasValue = true
    }
  }

  return hasValue ? assembled : undefined
}

/**
 * Builds question rows from a page's components and the submitted answers.
 * @param {FormComponent[] | undefined} components
 * @param {Answers} answers
 * @returns {{ label: string, answer: string }[]}
 */
function extractQuestions(components, answers) {
  return (components || [])
    .filter((component) => {
      if (!isAnswerableComponent(component)) {
        return false
      }
      const rawAnswer = resolveAnswer(component, answers)
      return rawAnswer !== undefined && rawAnswer !== null
    })
    .map((component) => ({
      label: component.shortDescription || component.title || '',
      answer: formatAnswer(component, resolveAnswer(component, answers))
    }))
}

/**
 * Groups pages into sections, each containing its answered questions.
 * @param {FormPage[] | undefined} pages
 * @param {Answers} answers
 * @param {boolean} hasParcelCards
 * @returns {{ title: string, questions: { label: string, answer: string }[] }[]}
 */
function buildSections(pages, answers, hasParcelCards) {
  return (pages || [])
    .filter((page) => !hasParcelCards || page.controller !== 'MapSelectPageController')
    .map((page) => ({
      title: page.title,
      questions: extractQuestions(
        page.components?.filter((component) => !hasParcelCards || component.name !== 'landParcels'),
        answers
      )
    }))
    .filter((section) => section.questions.length > 0)
}

/**
 * Combines answered pages by task, preserving the task list's first-page order.
 * @param {FormDefinition} definition
 * @param {Answers} answers
 * @param {boolean} hasParcelCards
 * @param {string | undefined} landAndActionsSectionId
 */
function buildTaskSections(definition, answers, hasParcelCards, landAndActionsSectionId) {
  const titles = new Map((definition.sections || []).map((section) => [section.id, section.title]))
  /** @type {Map<string | undefined, { title: string, questions: { label: string, answer: string }[], showLandAndActions: boolean }>} */
  const groups = new Map()

  for (const page of definition.pages || []) {
    const sectionId = page.section && titles.has(page.section) ? page.section : undefined
    const group = groups.get(sectionId) ?? createTaskSection(titles, sectionId, landAndActionsSectionId)
    groups.set(sectionId, group)
    for (const section of buildSections([page], answers, hasParcelCards)) {
      group.questions.push(...section.questions)
    }
  }

  return [...groups.values()].filter((section) => section.questions.length > 0 || section.showLandAndActions)
}

/**
 * Creates an empty task group, including whether it owns the land and payment cards.
 * @param {Map<string | undefined, string>} titles
 * @param {string | undefined} sectionId
 * @param {string | undefined} landAndActionsSectionId
 */
function createTaskSection(titles, sectionId, landAndActionsSectionId) {
  return {
    title: (sectionId && titles.get(sectionId)) || 'Submitted answers',
    questions: /** @type {{ label: string, answer: string }[]} */ ([]),
    showLandAndActions: Boolean(landAndActionsSectionId && sectionId === landAndActionsSectionId)
  }
}

/**
 * Builds the land and payment cards from submitted state for annual-payment journeys.
 * @param {Answers} answers
 */
function buildSubmittedLandAndActionsSummary(answers) {
  const payment = /** @type {PaymentCalculation | undefined} */ (answers.payment)

  // Single-payment journeys such as Woodland do not supply an annual total.
  if (payment?.annualTotalPence === undefined) {
    return null
  }

  return buildConfirmLandAndActionsViewModel(
    {
      ...payment,
      agreementStartDate: /** @type {string} */ (answers.agreementStartDate ?? payment.agreementStartDate),
      agreementEndDate: /** @type {string} */ (answers.agreementEndDate ?? payment.agreementEndDate),
      agreementTotalPence: /** @type {number} */ (answers.agreementTotalPence ?? payment.agreementTotalPence)
    },
    Array.isArray(answers.landParcels) ? undefined : /** @type {LandParcels | undefined} */ (answers.landParcels)
  )
}

/**
 * Finds the configured task that owns the land and payment cards.
 * @param {FormDefinition} definition
 * @param {boolean} enabled
 */
function findLandAndActionsSectionId(definition, enabled) {
  if (!enabled) {
    return undefined
  }

  const landAndActionsPage = definition.pages?.find(
    (formPage) =>
      ['MapSelectPageController', 'ConfirmLandAndActionsPageController'].includes(formPage.controller ?? '') &&
      formPage.section &&
      definition.sections?.some((section) => section.id === formPage.section)
  )
  return landAndActionsPage?.section
}

/**
 * Resolves list UUID references on components to actual items arrays.
 * @param {FormDefinition & { lists?: { id?: string, items?: ListItem[] }[] }} definition - Parsed YAML form definition
 * @returns {FormDefinition} The same definition, with list items resolved on components
 */
export function enrichDefinitionWithListItems(definition) {
  const listsById = buildListsMap(definition.lists || [])

  for (const page of definition.pages || []) {
    resolveComponentLists(page.components || [], listsById)
  }

  return definition
}

/**
 * Builds a Map of list ID → items from the definition's lists array.
 * @param {{ id?: string, items?: ListItem[] }[]} lists
 * @returns {Map<string, ListItem[]>}
 */
function buildListsMap(lists) {
  const listsById = new Map()

  for (const list of lists) {
    if (list.id) {
      listsById.set(list.id, list.items || [])
    }
  }

  return listsById
}

/**
 * Resolves list UUID references on components to actual items arrays.
 * @param {FormComponent[]} components
 * @param {Map<string, ListItem[]>} listsById
 */
function resolveComponentLists(components, listsById) {
  for (const component of components) {
    if (typeof component.list === 'string' && listsById.has(component.list)) {
      component.items = listsById.get(component.list)
    }
  }
}

/**
 * Assembles the view model for the print-submitted-application template.
 * @param {object} params
 * @param {FormDefinition} params.definition
 * @param {Answers} params.answers
 * @param {string} [params.referenceNumber]
 * @param {string} params.submittedAt
 * @param {string} params.slug
 * @param {{ contactName?: string, businessName?: string, sbi?: string }} params.sessionData
 * @param {FormMeta & {name: string}} params.form
 * @param {{ html: string }} [params.configurablePrintContent]
 * @param {{ person: { rows: object[] }, business: { rows: object[] }, contact: { rows: object[] } } | null} [params.applicantDetailsSections]
 * @param {{ path?: string, def?: { metadata?: { pageConfig?: Record<string, { width?: string }> } } }} [params.page]
 */
export function buildPrintViewModel({
  definition,
  answers,
  referenceNumber,
  submittedAt,
  slug,
  sessionData,
  form,
  configurablePrintContent,
  applicantDetailsSections,
  page
}) {
  let pageTitle = `${form.name} application`

  if (definition.metadata?.printPage?.includeApplicationInTitle === false) {
    pageTitle = form.name
  }

  const landAndActionsSummary = buildSubmittedLandAndActionsSummary(answers)

  const groupAnswersByTask =
    definition.pages?.some((formPage) => formPage.controller === 'TaskListPageController') ?? false
  const hasParcelCards = Boolean(landAndActionsSummary?.parcels.length)
  const landAndActionsSectionId = findLandAndActionsSectionId(
    definition,
    groupAnswersByTask && Boolean(landAndActionsSummary)
  )

  return {
    page,
    pageTitle,
    serviceName: form.name,
    serviceUrl: `/${slug}`,
    referenceNumber: referenceNumber || 'Not available',
    submittedAt,
    applicantDetails: {
      contactName: sessionData.contactName,
      businessName: sessionData.businessName,
      sbi: sessionData.sbi
    },
    applicantDetailsSections,
    groupAnswersByTask,
    sections: groupAnswersByTask
      ? buildTaskSections(definition, answers, hasParcelCards, landAndActionsSectionId)
      : buildSections(definition.pages, answers, hasParcelCards),
    landAndActionsSummary,
    landAndActionsGrouped: Boolean(landAndActionsSectionId),
    configurablePrintContent,
    breadcrumbs: []
  }
}

/**
 * Processes configurablePrintContent from YAML metadata — replaces component placeholders
 * and {{SLUG}} tokens.
 * @param {{ html?: string } | undefined} configurablePrintContent
 * @param {string} slug
 * @returns {{ html: string } | undefined}
 */
export function processConfigurablePrintContent(configurablePrintContent, slug) {
  if (!configurablePrintContent?.html) {
    return undefined
  }

  let processedHtml = ComponentsRegistry.replaceComponents(configurablePrintContent.html)

  if (slug) {
    processedHtml = processedHtml.replaceAll('{{SLUG}}', slug)
  }

  return { ...configurablePrintContent, html: processedHtml }
}

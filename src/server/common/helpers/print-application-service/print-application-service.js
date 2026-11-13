import { formatAnswer } from './utils/format-answer.js'
import { COMPONENT_TYPES, DISPLAY_ONLY_TYPES } from './constants.js'
import { buildConfirmLandAndActionsViewModel } from '~/src/server/land-grants/view-models/confirm-land-and-actions.view-model.js'
import { ComponentsRegistry } from '../../../confirmation/services/components.registry.js'
import { findPageByPath, normalisePagePath, resolveAdditionalAnswerSections } from '../additional-answers.js'
import { getSavedLocationHint } from '../../map/location-hints.js'
import { getNumberFieldInputs } from '../state/persist-formatting.js'
import { getNumberDisplayValue } from '../number-display-value.js'
import { getNumberFormatter } from '../number-formatter.js'

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
 * @import { AdditionalSection } from '../additional-answers.js'
 */

/**
 * @typedef {{ text: string, value: string | number | boolean }} ListItem
 * @typedef {{ type: string, name: string, title: string, options?: Record<string, unknown> & { format?: string, required?: boolean, showApproximateLocation?: boolean }, shortDescription?: string, list?: string, items?: ListItem[] }} FormComponent
 * @typedef {{ title: string, path?: string, section?: string, controller?: string, components?: FormComponent[], repeat?: { options: { name: string, title: string } } }} FormPage
 * @typedef {{ label: string, answer: string, locationHint?: string, repeatItems?: { title: string, questions: Question[] }[] }} Question
 * @typedef {{
 *   pages?: FormPage[],
 *   sections?: { id?: string, title: string }[],
 *   metadata?: {
 *     pageConfig?: Record<string, { additionalSections?: AdditionalSection[] }>,
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
  return Boolean(component.name) && !DISPLAY_ONLY_TYPES.has(component.type) && !component.name.startsWith('$$')
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
 * Builds a question row from an answerable component.
 * @param {FormComponent} component
 * @param {unknown} answer
 * @param {Answers} answers
 * @param {boolean} includeUnanswered
 * @param {import('../state/persist-formatting.js').NumberInputs} [numberInputs]
 * @returns {Question}
 */
function buildQuestion(component, answer, answers, includeUnanswered, numberInputs) {
  const locationHint = getSavedLocationHint(component, answers)
  const numberFormatter =
    component.type === COMPONENT_TYPES.NumberField ? getNumberFormatter(component.options?.format) : undefined
  const displayValue =
    numberFormatter && component.type === COMPONENT_TYPES.NumberField
      ? getNumberDisplayValue(answer, numberInputs?.[component.name])
      : answer

  return {
    label:
      (component.shortDescription || component.title || '') +
      (includeUnanswered && component.options?.required === false ? ' (optional)' : ''),
    answer: formatAnswer(component, displayValue) || (includeUnanswered ? 'Not provided' : ''),
    ...(locationHint ? { locationHint } : {})
  }
}

/**
 * Builds question rows from a page's components and the submitted answers.
 * @param {FormComponent[] | undefined} components
 * @param {Answers} answers
 * @param {boolean} includeUnanswered - Include all repeat fields, including blank optional answers
 * @param {import('../state/persist-formatting.js').NumberInputs} [numberInputs]
 * @returns {Question[]}
 */
function extractQuestions(components, answers, includeUnanswered, numberInputs) {
  /** @type {Question[]} */
  const questions = []

  for (const component of components || []) {
    if (!isAnswerableComponent(component)) {
      continue
    }

    const answer = resolveAnswer(component, answers)
    if (!includeUnanswered && (answer === undefined || answer === null)) {
      continue
    }

    questions.push(buildQuestion(component, answer, answers, includeUnanswered, numberInputs))
  }

  return questions
}

/**
 * Reads repeat fields exclusively from each saved item, never top-level state.
 * @param {FormPage} page
 * @param {Answers} answers
 * @param {Answers} savedState
 * @returns {Question[]}
 */
function extractRepeatQuestions(page, answers, savedState) {
  const { name, title } = page.repeat?.options ?? {}
  const values = name && answers[name]
  if (!Array.isArray(values)) {
    return []
  }

  const repeatItems = values
    .filter((item) => item !== null && typeof item === 'object' && !Array.isArray(item))
    .map((item, index) => ({
      title: `${title || page.title} ${index + 1}`,
      questions: extractQuestions(page.components, item, true, getNumberFieldInputs(savedState, name, item.itemId))
    }))
    .filter((item) => item.questions.length > 0)

  return repeatItems.length ? [{ label: title || page.title, answer: '', repeatItems }] : []
}

/**
 * Groups pages into sections, each containing its answered questions.
 * @param {FormPage[] | undefined} pages
 * @param {Answers} answers
 * @param {boolean} hasParcelCards
 * @param {Map<string | undefined, Question[]>} additionalQuestions
 * @param {Answers} savedState
 * @returns {{ title: string, questions: Question[] }[]}
 */
function buildSections(pages, answers, hasParcelCards, additionalQuestions, savedState) {
  return (pages || [])
    .map((page) => {
      const components =
        hasParcelCards && page.controller === 'MapSelectPageController'
          ? []
          : page.components?.filter((component) => !hasParcelCards || component.name !== 'landParcels')

      return {
        title: page.title,
        questions: [
          ...(page.controller === 'RepeatPageController'
            ? extractRepeatQuestions(page, answers, savedState)
            : extractQuestions(components, answers, false, getNumberFieldInputs(savedState))),
          ...(additionalQuestions.get(normalisePagePath(page.path)) ?? [])
        ]
      }
    })
    .filter((section) => section.questions.length > 0)
}

/**
 * Combines answered pages by task, preserving the task list's first-page order.
 * @param {FormDefinition} definition
 * @param {Answers} answers
 * @param {boolean} hasParcelCards
 * @param {string | undefined} landAndActionsSectionId
 * @param {Map<string | undefined, Question[]>} additionalQuestions
 * @param {Answers} savedState
 */
function buildTaskSections(
  definition,
  answers,
  hasParcelCards,
  landAndActionsSectionId,
  additionalQuestions,
  savedState
) {
  const titles = new Map((definition.sections || []).map((section) => [section.id, section.title]))
  /** @type {Map<string | undefined, { title: string, questions: Question[], showLandAndActions: boolean }>} */
  const groups = new Map()

  for (const page of definition.pages || []) {
    const sectionId = page.section && titles.has(page.section) ? page.section : undefined
    const group = groups.get(sectionId) ?? createTaskSection(titles, sectionId, landAndActionsSectionId)
    groups.set(sectionId, group)
    for (const section of buildSections([page], answers, hasParcelCards, additionalQuestions, savedState)) {
      group.questions.push(...section.questions)
    }
  }

  return [...groups.values()].filter((section) => section.questions.length > 0 || section.showLandAndActions)
}

/**
 * Checks whether additional answers have a valid owning page and section.
 * @param {FormDefinition} definition
 * @param {AdditionalSection} section
 */
function hasAdditionalSectionOwner(definition, section) {
  const ownerPage = section.page && findPageByPath(definition.pages, section.page)
  if (!ownerPage) {
    return false
  }

  return !ownerPage.section || definition.sections?.some(({ id }) => id === ownerPage.section)
}

/**
 * Reuses Check answers display configuration with the saved submission values.
 * Page-owned rows join the existing page/task; titled sections follow the answers.
 * @param {FormDefinition} definition
 * @param {Answers} savedState
 * @param {boolean} hasLandAndActionsSummary
 * @param {{ path: string }[] | undefined} relevantPages
 */
function buildAdditionalSections(definition, savedState, hasLandAndActionsSummary, relevantPages) {
  /** @type {Map<string | undefined, Question[]>} */
  const questionsByPage = new Map()
  /** @type {{ title: string, questions: Question[] }[]} */
  const sections = []
  const seenValues = new Set()
  const excludedStateValues = hasLandAndActionsSummary ? new Set(['totalPayment']) : undefined

  for (const summaryPage of definition.pages ?? []) {
    if (summaryPage.controller !== 'CheckResponsesPageController' || !summaryPage.path) {
      continue
    }

    const configuredSections = definition.metadata?.pageConfig?.[summaryPage.path]?.additionalSections
    const resolvedSections = resolveAdditionalAnswerSections(configuredSections, savedState, {
      relevantPages,
      excludedStateValues
    })
    const displayableSections = resolvedSections.filter(
      (section) => section.title || hasAdditionalSectionOwner(definition, section)
    )
    for (const section of displayableSections) {
      const path = normalisePagePath(section.page)
      const questions = section.items
        .filter(({ stateValue }) => {
          if (seenValues.has(stateValue)) {
            return false
          }
          seenValues.add(stateValue)
          return true
        })
        .map(({ title, value }) => ({
          label: title,
          answer: formatAnswer({ type: COMPONENT_TYPES.TextField }, value)
        }))

      if (questions.length === 0) {
        continue
      }
      if (section.title) {
        sections.push({ title: section.title, questions })
      } else {
        questionsByPage.set(path, [...(questionsByPage.get(path) ?? []), ...questions])
      }
    }
  }

  return { questionsByPage, sections }
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
    questions: /** @type {Question[]} */ ([]),
    showLandAndActions: Boolean(landAndActionsSectionId && sectionId === landAndActionsSectionId)
  }
}

/**
 * Builds the land and payment cards from submitted state for annual-payment journeys.
 * @param {Answers} savedState
 */
function buildSubmittedLandAndActionsSummary(savedState) {
  const payment = /** @type {PaymentCalculation | undefined} */ (savedState.payment)

  // Single-payment journeys such as Woodland do not supply an annual total.
  if (payment?.annualTotalPence === undefined) {
    return null
  }

  return buildConfirmLandAndActionsViewModel(
    {
      ...payment,
      agreementStartDate: /** @type {string} */ (savedState.agreementStartDate ?? payment.agreementStartDate),
      agreementEndDate: /** @type {string} */ (savedState.agreementEndDate ?? payment.agreementEndDate),
      agreementTotalPence: /** @type {number} */ (savedState.agreementTotalPence ?? payment.agreementTotalPence)
    },
    Array.isArray(savedState.landParcels) ? undefined : /** @type {LandParcels | undefined} */ (savedState.landParcels)
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
 * @param {Answers} params.answers - Applicable form answers resolved by the forms engine
 * @param {Answers} params.savedState - Full saved state, including calculated results
 * @param {string} [params.referenceNumber]
 * @param {string} params.submittedAt
 * @param {string} params.slug
 * @param {{ contactName?: string, businessName?: string, sbi?: string }} params.sessionData
 * @param {FormMeta & {name: string}} params.form
 * @param {{ html: string }} [params.configurablePrintContent]
 * @param {{ person: { rows: object[] }, business: { rows: object[] }, contact: { rows: object[] } } | null} [params.applicantDetailsSections]
 * @param {{ path?: string, def?: { metadata?: { pageConfig?: Record<string, { width?: string }> } } }} [params.page]
 * @param {{ path: string }[]} [params.relevantPages] - Applicable pages resolved by the forms engine
 */
export function buildPrintViewModel({
  definition,
  answers,
  savedState,
  referenceNumber,
  submittedAt,
  slug,
  sessionData,
  form,
  configurablePrintContent,
  applicantDetailsSections,
  page,
  relevantPages
}) {
  let pageTitle = `${form.name} application`

  if (definition.metadata?.printPage?.includeApplicationInTitle === false) {
    pageTitle = form.name
  }

  const landAndActionsSummary = buildSubmittedLandAndActionsSummary(savedState)

  const groupAnswersByTask =
    definition.pages?.some((formPage) => formPage.controller === 'TaskListPageController') ?? false
  const hasParcelCards = Boolean(landAndActionsSummary?.parcels.length)
  const landAndActionsSectionId = findLandAndActionsSectionId(
    definition,
    groupAnswersByTask && Boolean(landAndActionsSummary)
  )
  const additional = buildAdditionalSections(definition, savedState, Boolean(landAndActionsSummary), relevantPages)
  const printAnswers = { ...answers, mapLocationHints: savedState.mapLocationHints }

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
    sections: [
      ...(groupAnswersByTask
        ? buildTaskSections(
            definition,
            printAnswers,
            hasParcelCards,
            landAndActionsSectionId,
            additional.questionsByPage,
            savedState
          )
        : buildSections(definition.pages, printAnswers, hasParcelCards, additional.questionsByPage, savedState)),
      ...additional.sections
    ],
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

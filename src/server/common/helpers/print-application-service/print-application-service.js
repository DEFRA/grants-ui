import { formatAnswer } from './utils/format-answer.js'
import { DISPLAY_ONLY_TYPES, COMPONENT_TYPES } from './constants.js'
import { buildPrintPaymentViewModel } from './utils/build-print-payment-view-model.js'
import { ComponentsRegistry } from '../../../confirmation/services/components.registry.js'

const COMPOSITE_FIELD_PARTS = {
  [COMPONENT_TYPES.DatePartsField]: ['day', 'month', 'year'],
  [COMPONENT_TYPES.MonthYearField]: ['month', 'year'],
  [COMPONENT_TYPES.UkAddressField]: ['addressLine1', 'addressLine2', 'town', 'county', 'postcode']
}

/**
 * @typedef {{ type: string, name: string, title: string, list?: string, items?: Array<{text: string, value: string | number | boolean}> }} FormComponent
 * @typedef {{ title: string, components?: FormComponent[] }} FormPage
 * @typedef {{ pages?: FormPage[] }} FormDefinition
 * @typedef {{ title: string, path?: string, slug: string, id: string }} FormMeta
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
      label: component.title,
      answer: formatAnswer(component, resolveAnswer(component, answers))
    }))
}

/**
 * Groups pages into sections, each containing its answered questions.
 * @param {FormPage[] | undefined} pages
 * @param {Answers} answers
 * @returns {{ title: string, questions: { label: string, answer: string }[] }[]}
 */
function buildSections(pages, answers) {
  return (pages || [])
    .map((page) => ({
      title: page.title,
      questions: extractQuestions(page.components, answers)
    }))
    .filter((section) => section.questions.length > 0)
}

/**
 * Resolves list UUID references on components to actual items arrays.
 * @param {FormDefinition & { lists?: { id?: string, items?: object[] }[] }} definition - Parsed YAML form definition
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
 * @param {{ id?: string, items?: object[] }[]} lists
 * @returns {Map<string, object[]>}
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
 * @param {Map<string, object[]>} listsById
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
 * @param {FormMeta} params.form
 * @param {{ html: string }} [params.configurablePrintContent]
 * @param {{ person: { rows: object[] }, business: { rows: object[] }, contact: { rows: object[] } } | null} [params.applicantDetailsSections]
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
  applicantDetailsSections
}) {
  return {
    pageTitle: `${form.title} application`,
    serviceName: form.title,
    serviceUrl: `/${slug}`,
    referenceNumber: referenceNumber || 'Not available',
    submittedAt,
    applicantDetails: {
      contactName: sessionData.contactName,
      businessName: sessionData.businessName,
      sbi: sessionData.sbi
    },
    applicantDetailsSections,
    sections: buildSections(definition.pages, answers),
    paymentInfo: buildPrintPaymentViewModel(answers.payment),
    configurablePrintContent,
    breadcrumbs: []
  }
}

/**
 * Processes configurablePrintContent from YAML metadata — replaces component placeholders
 * and {{SLUG}} tokens.
 * @param {object | undefined} configurablePrintContent
 * @param {string} slug
 * @returns {object | undefined}
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

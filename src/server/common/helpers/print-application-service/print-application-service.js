import { getFormsCache } from '../../forms/services/form.js'
import { formatAnswer } from './utils/format-answer.js'
import { DISPLAY_ONLY_TYPES } from './constants.js'

/**
 * @typedef {{ type: string, name: string, title: string }} FormComponent
 * @typedef {{ title: string, components?: FormComponent[] }} FormPage
 * @typedef {{ pages?: FormPage[] }} FormDefinition
 * @typedef {{ title: string, path: string, slug: string, id: string }} FormMeta
 * @typedef {Record<string, unknown>} Answers
 */

/**
 * Finds a cached form entry by its slug.
 * @param {string} slug
 * @returns {FormMeta | null}
 */
export function findFormBySlug(slug) {
  const allForms = getFormsCache()
  return allForms.find((f) => f.slug === slug) || null
}

/**
 * Checks whether a component should produce a question row.
 * @param {FormComponent} component
 * @returns {boolean}
 */
function isAnswerableComponent(component) {
  return !DISPLAY_ONLY_TYPES.has(component.type) && !component.name?.startsWith('$$')
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
      const rawAnswer = answers[component.name]
      return rawAnswer !== undefined && rawAnswer !== null
    })
    .map((component) => ({
      label: component.title,
      answer: formatAnswer(component, answers[component.name])
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
 * Assembles the view model for the print-submitted-application template.
 * @param {object} params
 * @param {FormDefinition} params.definition
 * @param {Answers} params.answers
 * @param {string} [params.referenceNumber]
 * @param {string} params.submittedAt
 * @param {string} params.slug
 * @param {{ contactName?: string, businessName?: string, sbi?: string }} params.sessionData
 * @param {FormMeta} params.form
 */
export function buildPrintViewModel({ definition, answers, referenceNumber, submittedAt, slug, sessionData, form }) {
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
    sections: buildSections(definition.pages, answers),
    breadcrumbs: []
  }
}

import { getFormsCache } from '../../forms/services/form.js'
import { formatAnswer } from './utils/format-answer.js'

export class PrintApplicationService {
  static findFormBySlug(slug) {
    const allForms = getFormsCache()
    return allForms.find((f) => f.slug === slug) || null
  }

  static buildPrintViewModel({ form, answers, referenceNumber, submittedAt, slug }) {
    const sections = []

    for (const page of form.pages) {
      if (page.hideFromPrint === true) {
        continue
      }

      const pageQuestions = []

      for (const question of page.questions) {
        if (this.shouldSkipQuestion(question)) {
          continue
        }

        const rawAnswer = answers[question.name]
        if (rawAnswer === undefined || rawAnswer === null) {
          continue
        }

        pageQuestions.push({
          label: question.label,
          answer: formatAnswer(question, rawAnswer)
        })
      }

      if (pageQuestions.length > 0) {
        sections.push({
          title: page.title,
          questions: pageQuestions
        })
      }
    }

    return {
      slug,
      referenceNumber,
      submittedAt,
      sections
    }
  }

  static shouldSkipQuestion(question) {
    return question.type === 'hidden' || question.printable === false || question.name?.startsWith('$$')
  }
}

import { RepeatPageController } from '@defra/forms-engine-plugin/controllers/RepeatPageController.js'
import { ItemField } from '@defra/forms-engine-plugin/engine/models/SummaryViewModel.js'
import { evaluateTemplate, redirectPath } from '@defra/forms-engine-plugin/engine/helpers.js'
import { getAnswerMarkdown, markdown } from '@defra/forms-engine-plugin/engine/components/helpers/components.js'
import escapeHtml from 'lodash/escape.js'

/**
 * Associates each repeat answer row with cards built from relevant item state.
 * Run while the engine's detail items and summary rows still share their indexes.
 * @param {{ details?: Detail[], checkAnswers?: AnswerSection[] }} viewModel
 * @param {FormContext} context
 * @param {string} returnUrl
 * @returns {Map<SummaryListRow, SummaryList[]>}
 */
export function buildRepeatAnswerCards(viewModel, context, returnUrl) {
  const cardsByRow = new Map()
  viewModel.details?.forEach((detail, sectionIndex) => {
    detail.items?.forEach((item, itemIndex) => {
      const { page } = item
      const row = viewModel.checkAnswers?.[sectionIndex]?.summaryList?.rows[itemIndex]
      if (!(page instanceof RepeatPageController) || !context.relevantPages.includes(page) || !row) {
        return
      }

      const list = page.getListFromState(context.relevantState)
      if (!list.length) {
        row.value = { text: 'Not provided' }
        return
      }

      cardsByRow.set(
        row,
        list.map((itemState, index) => {
          const itemContext = { ...context, relevantState: { ...context.relevantState, ...itemState } }
          const title = `${evaluateTemplate(page.repeat.options.title, itemContext)} ${index + 1}`
          return {
            card: {
              title: { text: title },
              actions: {
                items: context.isForceAccess
                  ? []
                  : [
                      {
                        href: redirectPath(page.getHref(`${page.path}${page.getSummaryPath()}`), { returnUrl }),
                        text: 'Change',
                        classes: 'govuk-link--no-visited-state'
                      }
                    ]
              }
            },
            rows: page.collection.fields.map((field) => {
              const answer = ItemField(page, itemState, field, { path: page.path })
              const value = markdown.parse(escapeHtml(getAnswerMarkdown(field, itemState)), { async: false }).trim()
              return {
                key: { text: evaluateTemplate(answer.title, itemContext) },
                value: { html: value || 'Not provided', classes: 'app-prose-scope' }
              }
            })
          }
        })
      )
    })
  })
  return cardsByRow
}

/**
 * Splits ordinary answer lists around repeat cards, preserving form order.
 * Run after other summary customisations so additional answers are included.
 * @param {{ checkAnswers?: AnswerSection[] }} viewModel
 * @param {Map<SummaryListRow, SummaryList[]>} cardsByRow
 */
export function applyRepeatAnswerCards(viewModel, cardsByRow) {
  viewModel.checkAnswers?.forEach((section) => {
    const rows = section.summaryList?.rows ?? []
    if (!rows.some((row) => cardsByRow.has(row))) {
      return
    }

    const answerGroups = []
    let ordinaryRows = []
    for (const row of rows) {
      const cards = cardsByRow.get(row)
      if (cards) {
        if (ordinaryRows.length) {
          answerGroups.push({ ...section.summaryList, rows: ordinaryRows })
          ordinaryRows = []
        }
        answerGroups.push(...cards)
      } else {
        ordinaryRows.push(row)
      }
    }
    if (ordinaryRows.length) {
      answerGroups.push({ ...section.summaryList, rows: ordinaryRows })
    }
    section.answerGroups = answerGroups
  })
}

/**
 * @typedef {CheckAnswers & { answerGroups?: SummaryList[] }} AnswerSection
 * @import { FormContext, CheckAnswers, SummaryList, SummaryListRow } from '@defra/forms-engine-plugin/types'
 * @import { Detail } from '@defra/forms-engine-plugin/engine/models/types.js'
 */

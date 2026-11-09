import { escapeHtml } from '@hapi/hoek'
import { evaluateTemplate, getPage } from '@defra/forms-engine-plugin/engine/helpers.js'
import { MAP_LOCATION_HINT_PREFIX } from '../../../shared/map-location-hints.js'

const POINT_FIELDS = new Set(['EastingNorthingField', 'LatLongField', 'OsGridRefField'])
const POINT_FIELD_PARTS = {
  EastingNorthingField: ['easting', 'northing'],
  LatLongField: ['latitude', 'longitude']
}
const SUMMARY_VIEWS = new Set(['summary', 'summary.html', 'check-responses-page', 'check-responses-page.html'])
const MAX_METADATA_LENGTH = 4096
const MAX_TEXT_LENGTH = 1000

const isEnabled = (field) => POINT_FIELDS.has(field?.type) && field.options?.showApproximateLocation === true
const isFormsRoute = (request) => request.route?.realm?.plugin === '@defra/forms-engine-plugin'

/**
 * Remove internal metadata before the engine validates the configured answer fields.
 * It stays request-local until the resolved page and validated answers are available.
 * @param {Request} request
 * @param {ResponseToolkit} h
 */
export function captureLocationHints(request, h) {
  if (!isFormsRoute(request) || request.method !== 'post' || !request.payload || typeof request.payload !== 'object') {
    return h.continue
  }

  const metadata = Object.create(null)
  for (const [key, value] of Object.entries(request.payload)) {
    if (key.startsWith(MAP_LOCATION_HINT_PREFIX)) {
      metadata[key.slice(MAP_LOCATION_HINT_PREFIX.length)] = value
      delete request.payload[key]
    }
  }
  hintRequest(request).app.mapLocationHintMetadata = metadata
  return h.continue
}

/** Compare the actual answer inputs, allowing the engine's numeric/whitespace normalisation. */
function answerKey(field, answer) {
  if (!answer || typeof answer !== 'object' || Array.isArray(answer)) {
    return undefined
  }
  const keys =
    field.type === 'OsGridRefField'
      ? [field.name]
      : POINT_FIELD_PARTS[field.type].map((part) => `${field.name}__${part}`)
  if (Object.keys(answer).length !== keys.length) {
    return undefined
  }
  const values = keys.map((key) => {
    const value = answer[key]
    if (typeof value !== 'string' && typeof value !== 'number') {
      return undefined
    }
    const text = String(value).trim()
    if (!text) {
      return undefined
    }
    if (field.type === 'OsGridRefField') {
      return text.toUpperCase().replace(/\s+/g, '')
    }
    const number = Number(text)
    return Number.isFinite(number) ? number : undefined
  })
  return values.includes(undefined) ? undefined : JSON.stringify(values)
}

/** Return saved display text only for an enabled component whose answer still matches. */
export function getSavedLocationHint(component, state) {
  if (!isEnabled(component)) {
    return undefined
  }
  const hint = state?.mapLocationHints?.[component.name]
  if (typeof hint?.text !== 'string' || !hint.text.trim()) {
    return undefined
  }
  const parts = POINT_FIELD_PARTS[component.type]
  const answer = parts
    ? Object.fromEntries(
        parts.map((part) => [
          `${component.name}__${part}`,
          state[`${component.name}__${part}`] ?? state[component.name]?.[part]
        ])
      )
    : { [component.name]: state[component.name] }
  const expected = answerKey(component, answer)
  return expected && hint.answer === expected ? hint.text : undefined
}

function parseHint(raw, field, state) {
  if (typeof raw !== 'string' || raw.length > MAX_METADATA_LENGTH) {
    return undefined
  }
  try {
    const hint = JSON.parse(raw)
    if (typeof hint?.text !== 'string' || !hint.text.trim() || hint.text.length > MAX_TEXT_LENGTH) {
      return undefined
    }
    const answer = answerKey(field, field.getFormDataFromState(state))
    return answer && answer === answerKey(field, hint.answer) ? { text: hint.text, answer } : undefined
  } catch {
    // Optional display metadata must not turn a valid answer into a validation error.
    return undefined
  }
}

/**
 * Add hints to auxiliary state; the normal question POST persists this with the answers.
 * No configured component owns this key, so it is absent from relevantState and GAS answers.
 * @param {AnyFormRequest} request
 * @param {FormContext} context
 */
export function applyLocationHints(request, context) {
  if (request.method !== 'post' || context.errors?.length || context.isForceAccess) {
    return
  }
  const page = getPage(request.app.model, request)
  const fields = page.collection.fields.filter((field) => POINT_FIELDS.has(field.type))
  if (!fields.length) {
    return
  }
  const state = /** @type {Record<string, any>} */ (context.state)
  const hints = { ...state.mapLocationHints }
  const metadata = hintRequest(request).app.mapLocationHintMetadata ?? {}
  for (const field of fields) {
    // A changed, cleared, unavailable or disabled hint must not retain the old text.
    delete hints[field.name]
    const hint = isEnabled(field) ? parseHint(metadata[field.name], field, state) : undefined
    if (hint) {
      hints[field.name] = hint
    }
  }
  context.state = { ...state, mapLocationHints: hints }
}

/**
 * Decorate CYA view rows centrally, including the engine's standard summary controller.
 * Keep detail values and persisted answers untouched; only display rows contain the hint.
 * @param {Request} request
 * @param {ResponseToolkit} h
 */
export function renderLocationHints(request, h) {
  const response = /** @type {{ variety?: string, source?: { template: string, context: any } }} */ (request.response)
  const source = response?.source
  if (!isFormsRoute(request) || response?.variety !== 'view' || !source || !SUMMARY_VIEWS.has(source.template)) {
    return h.continue
  }
  const viewModel = source.context
  viewModel.details?.forEach((detail, sectionIndex) => {
    detail.items.forEach((item, rowIndex) => {
      const { field, state } = item
      const row = viewModel.checkAnswers?.[sectionIndex]?.summaryList?.rows[rowIndex]
      const hint = getSavedLocationHint(field, state)
      // CheckResponsesPageController can insert summary sections that have no matching `details` entry.
      if (!row || !hint || row.key?.text !== evaluateTemplate(item.title, viewModel.context)) {
        return
      }
      const text = escapeHtml(hint)
      row.value = {
        ...row.value,
        html: `${row.value.html ?? escapeHtml(row.value.text ?? '')}<p class="govuk-body govuk-!-margin-top-1">${text}</p>`
      }
    })
  })
  return h.continue
}

/** @param {Request | AnyFormRequest} request */
function hintRequest(request) {
  return /** @type {{ app: { mapLocationHintMetadata?: Record<string, unknown> } }} */ (request)
}

/**
 * @import { Request, ResponseToolkit } from '@hapi/hapi'
 * @import { AnyFormRequest, FormContext } from '@defra/forms-engine-plugin/engine/types.js'
 */

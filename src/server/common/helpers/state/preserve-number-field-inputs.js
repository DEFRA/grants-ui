import { getPage } from '@defra/forms-engine-plugin/engine/helpers.js'
import { formatThousands, isDecimalString } from '~/src/shared/format-number.js'

/** @typedef {import('@defra/forms-engine-plugin/types').FormContext} FormContext */

/**
 * @param {{ state: Record<string, unknown> }} context
 * @param {string[]} names
 * @param {Record<string, unknown>} payload
 */
function saveInputs(context, names, payload) {
  if (!names.length) {
    return
  }
  const { $$__numberFieldInputs: saved, ...state } = context.state
  const inputs = { .../** @type {Record<string, string> | undefined} */ (saved) }
  for (const name of names) {
    const value = payload[name]
    const input = typeof value === 'string' ? value.trim() : ''
    const number = Number(input)
    if (isDecimalString(input) && number === state[name] && formatThousands(input) !== formatThousands(number)) {
      inputs[name] = input
    } else {
      delete inputs[name]
    }
  }
  context.state = Object.keys(inputs).length ? { ...state, $$__numberFieldInputs: inputs } : state
}

/**
 * Retain entered precision for playback and for revisiting a number question.
 * @param {import('@defra/forms-engine-plugin/types').AnyFormRequest} request
 * @param {FormContext} context
 */
export function preserveNumberFieldInputs(request, context) {
  if (context.errors || context.isForceAccess || !request.app.model) {
    return
  }
  const isPost = request.method === 'post'
  const payload = /** @type {Record<string, unknown>} */ (isPost ? request.payload : context.payload)
  const page = getPage(request.app.model, request)
  const names = page.collection.fields
    .filter((field) => {
      const definition = /** @type {{ format?: string } | undefined} */ (context.componentDefMap.get(field.name))
      return field.type === 'NumberField' && definition?.format === 'thousands' && field.name in payload
    })
    .map((field) => field.name)
  if (isPost) {
    saveInputs(context, names, payload)
    return
  }
  const inputs = /** @type {Record<string, string> | undefined} */ (context.state.$$__numberFieldInputs)
  for (const name of names) {
    const input = inputs?.[name]
    if (isDecimalString(input) && Number(input) === context.state[name]) {
      context.payload = { ...context.payload, [name]: input }
    }
  }
}

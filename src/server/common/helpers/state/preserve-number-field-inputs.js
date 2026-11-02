import { getPage } from '@defra/forms-engine-plugin/engine/helpers.js'

/** @typedef {import('@defra/forms-engine-plugin/types').FormContext} FormContext */
/** @typedef {{ name: string, key: string }} InputField */

/**
 * @param {unknown} rawInput
 * @param {unknown} answer
 * @returns {rawInput is string}
 */
function matchesAnswer(rawInput, answer) {
  return typeof rawInput === 'string' && rawInput.trim() !== '' && Number(rawInput) === answer
}

/**
 * @param {{ state: Record<string, unknown> }} context
 * @param {InputField[]} fields
 * @param {Record<string, unknown>} answers
 * @param {Record<string, unknown>} payload
 */
function saveNumberFieldInputs(context, fields, answers, payload) {
  if (!fields.length) {
    return
  }

  const savedInputs = /** @type {Record<string, string> | undefined} */ (context.state.$$__numberFieldInputs)
  const inputs = { ...savedInputs }
  for (const { name, key } of fields) {
    const rawInput = payload[name]
    if (matchesAnswer(rawInput, answers[name])) {
      inputs[key] = rawInput.trim()
    } else {
      delete inputs[key]
    }
  }
  context.state = { ...context.state, $$__numberFieldInputs: inputs }
}

/**
 * @param {FormContext} context
 * @param {InputField[]} fields
 * @param {Record<string, unknown>} answers
 */
function restoreNumberFieldInputs(context, fields, answers) {
  const inputs = /** @type {Record<string, string> | undefined} */ (context.state.$$__numberFieldInputs)
  for (const { name, key } of fields) {
    const rawInput = inputs?.[key]
    if (matchesAnswer(rawInput, answers[name])) {
      context.payload = { ...context.payload, [name]: rawInput }
    }
  }
}

/**
 * Retain display precision separately from numeric answers and submission data.
 * @param {import('@defra/forms-engine-plugin/types').AnyFormRequest} request
 * @param {FormContext} context
 */
export function preserveNumberFieldInputs(request, context) {
  if (context.errors || context.isForceAccess || !request.app.model) {
    return
  }

  const page = getPage(request.app.model, request)
  const state = /** @type {Record<string, any>} */ (context.state)
  const isPost = request.method === 'post'
  const payload = /** @type {Record<string, unknown>} */ (isPost ? request.payload : context.payload)
  const repeat = /** @type {{ repeat?: { options: { name: string } } }} */ (page).repeat
  const itemId = context.payload.itemId
  const answers = repeat
    ? state[repeat.options.name]?.find((/** @type {{ itemId: string }} */ item) => item.itemId === itemId)
    : state
  if (!answers) {
    return
  }

  const fields = page.collection.fields
    .filter((field) => {
      const definition = /** @type {{ format?: string } | undefined} */ (context.componentDefMap.get(field.name))
      return field.type === 'NumberField' && definition?.format === 'thousands' && field.name in payload
    })
    .map(({ name }) => ({ name, key: repeat ? `${name}:${itemId}` : name }))

  if (isPost) {
    saveNumberFieldInputs(context, fields, answers, payload)
  } else {
    restoreNumberFieldInputs(context, fields, answers)
  }
}

import { RepeatPageController } from '@defra/forms-engine-plugin/controllers/RepeatPageController.js'
import { getPage } from '@defra/forms-engine-plugin/engine/helpers.js'
import { formatThousands, isDecimalString } from '~/src/shared/format-number.js'
import { getNumberFormatter } from '../number-formatter.js'

/**
 * @typedef {import('@defra/forms-engine-plugin/types').FormContext} FormContext
 * @typedef {Record<string, string>} NumberInputs
 * @typedef {Record<string, Record<string, NumberInputs>>} RepeatNumberInputs
 */

/**
 * @param {Record<string, unknown>} state
 * @param {string} [repeatName]
 * @param {unknown} [itemId]
 * @returns {NumberInputs | undefined}
 */
export function getNumberFieldInputs(state, repeatName, itemId) {
  if (repeatName) {
    const repeats = /** @type {RepeatNumberInputs | undefined} */ (state.$$__repeatNumberFieldInputs)
    return typeof itemId === 'string' ? repeats?.[repeatName]?.[itemId] : undefined
  }
  return /** @type {NumberInputs | undefined} */ (state.$$__numberFieldInputs)
}

/**
 * @param {Record<string, unknown>} state
 * @param {NumberInputs | undefined} saved
 * @param {string[]} names
 * @param {Record<string, unknown>} payload
 */
function getPostedInputs(state, saved, names, payload) {
  const inputs = { ...saved }
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
  return inputs
}

/**
 * @param {FormContext} context
 * @param {string[]} names
 * @param {Record<string, unknown>} payload
 */
function restorePostedInputs(context, names, payload) {
  for (const name of names) {
    const input = payload[name]
    if (typeof input === 'string') {
      context.payload = { ...context.payload, [name]: input }
    }
  }
}

/**
 * @param {FormContext} context
 * @param {Record<string, unknown>} state
 * @param {NumberInputs | undefined} inputs
 * @param {string[]} names
 */
function restoreSavedInputs(context, state, inputs, names) {
  for (const name of names) {
    const input = inputs?.[name]
    if (isDecimalString(input) && Number(input) === state[name]) {
      context.payload = { ...context.payload, [name]: input }
    }
  }
}

/**
 * @param {{ state: Record<string, unknown> }} context
 * @param {NumberInputs} inputs
 * @param {string} [repeatName]
 * @param {string} [itemId]
 */
function saveInputs(context, inputs, repeatName, itemId) {
  if (repeatName && itemId) {
    const repeats = /** @type {RepeatNumberInputs | undefined} */ (context.state.$$__repeatNumberFieldInputs)
    const items = { ...repeats?.[repeatName] }
    if (Object.keys(inputs).length) {
      items[itemId] = inputs
    } else {
      delete items[itemId]
    }
    context.state = {
      ...context.state,
      $$__repeatNumberFieldInputs: { ...repeats, [repeatName]: items }
    }
  } else {
    const { $$__numberFieldInputs: saved, ...state } = context.state
    context.state = Object.keys(inputs).length ? { ...state, $$__numberFieldInputs: inputs } : state
  }
}

/**
 * Retain entered precision for display formatting and for revisiting a number question.
 * @param {import('@defra/forms-engine-plugin/types').AnyFormRequest} request
 * @param {FormContext} context
 */
export function persistFormatting(request, context) {
  if (context.isForceAccess || !request.app.model) {
    return
  }
  const isPost = request.method === 'post'
  const payload = /** @type {Record<string, unknown>} */ (isPost ? request.payload : context.payload)
  const page = getPage(request.app.model, request)
  const names = page.collection.fields
    .filter((field) => {
      const definition = /** @type {{ options?: { format?: string } } | undefined} */ (
        context.componentDefMap.get(field.name)
      )
      return field.type === 'NumberField' && getNumberFormatter(definition?.options?.format) && field.name in payload
    })
    .map((field) => field.name)
  if (!names.length) {
    return
  }
  if (context.errors) {
    if (isPost) {
      restorePostedInputs(context, names, payload)
    }
    return
  }
  const repeatName = page instanceof RepeatPageController ? page.repeat.options.name : undefined
  const itemId = page.getItemId(request)
  const state =
    page instanceof RepeatPageController
      ? page.getItemFromList(page.getListFromState(context.state), itemId)
      : context.state
  if (!state) {
    return
  }
  const inputs = getNumberFieldInputs(context.state, repeatName, itemId)
  if (!isPost) {
    restoreSavedInputs(context, state, inputs, names)
    return
  }
  saveInputs(context, getPostedInputs(state, inputs, names, payload), repeatName, itemId)
}

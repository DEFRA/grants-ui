import { getPage } from '@defra/forms-engine-plugin/engine/helpers.js'

/**
 * Retain display precision separately from numeric answers and submission data.
 * @param {import('@defra/forms-engine-plugin/types').AnyFormRequest} request
 * @param {import('@defra/forms-engine-plugin/types').FormContext} context
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

  let inputs
  for (const field of page.collection.fields) {
    const definition = /** @type {{ format?: string } | undefined} */ (context.componentDefMap.get(field.name))
    if (field.type !== 'NumberField' || definition?.format !== 'thousands' || !(field.name in payload)) {
      continue
    }
    const value = answers[field.name]
    const key = repeat ? `${field.name}:${itemId}` : field.name
    const rawInput = isPost ? payload[field.name] : state.$$__numberFieldInputs?.[key]
    const matchesAnswer =
      typeof rawInput === 'string' && rawInput.trim() !== '' && typeof value === 'number' && Number(rawInput) === value

    if (!isPost) {
      if (matchesAnswer) {
        context.payload = { ...context.payload, [field.name]: rawInput }
      }
      continue
    }

    inputs ??= { ...state.$$__numberFieldInputs }
    if (matchesAnswer) {
      inputs[key] = rawInput.trim()
    } else {
      delete inputs[key]
    }
  }

  if (inputs) {
    context.state = { ...state, $$__numberFieldInputs: inputs }
  }
}

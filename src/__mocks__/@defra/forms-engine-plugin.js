import { vi } from 'vitest'
export const QuestionPageController = class {
  getViewModel() {
    return {
      pageTitle: 'Default Title'
    }
  }

  makeGetRouteHandler() {
    return vi.fn()
  }

  makePostRouteHandler() {
    return vi.fn()
  }

  proceed() {
    return vi.fn()
  }

  getNextPath() {
    return '/next'
  }

  setState() {
    return vi.fn()
  }
}

export const SummaryPageController = class {
  /**
   * @param {FormModel} model
   * @param {Page} pageDef
   */
  constructor(model, pageDef) {
    this.model = model
    this.pageDef = pageDef
  }

  getViewModel() {
    return {
      pageTitle: 'Default Title'
    }
  }

  makeGetRouteHandler() {
    return vi.fn()
  }

  makePostRouteHandler() {
    return vi.fn()
  }

  proceed() {
    return vi.fn()
  }

  getNextPath() {
    return '/next'
  }

  setState() {
    return vi.fn()
  }
}

/** @type {MockPlugin} */
const plugin = {
  name: 'forms-engine-plugin',
  register: vi.fn(),
  controllers: {
    QuestionPageController
  }
}

plugin.createServer = vi.fn().mockImplementation(() => {
  return {
    initialize: vi.fn().mockResolvedValue(true),
    stop: vi.fn().mockResolvedValue(true),
    inject: vi.fn().mockResolvedValue({ result: '', statusCode: 200 })
  }
})

export default plugin

/**
 * @import { Mock } from 'vitest'
 * @import { FormModel } from '@defra/forms-engine-plugin/engine/models/index.js'
 * @import { Page } from '@defra/forms-model'
 * @typedef {{
 *   name: string,
 *   register: Mock,
 *   controllers: { QuestionPageController: typeof QuestionPageController },
 *   createServer?: Mock
 * }} MockPlugin
 */

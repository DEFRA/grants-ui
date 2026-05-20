import { vi } from 'vitest'

export class SummaryPageController {
  /**
   * @param {FormModel} model
   * @param {Page} pageDef
   */
  constructor(model, pageDef) {
    this.model = model
    this.pageDef = pageDef
  }

  /**
   * @param {FormContextRequest} request
   * @param {FormContext} context
   * @returns {{ pageTitle: string }}
   */
  getViewModel(request, context) {
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

export default SummaryPageController

/**
 * @import { FormContext, FormContextRequest } from '@defra/forms-engine-plugin/engine/types.js'
 * @import { FormModel } from '@defra/forms-engine-plugin/engine/models/index.js'
 * @import { Page } from '@defra/forms-model'
 */

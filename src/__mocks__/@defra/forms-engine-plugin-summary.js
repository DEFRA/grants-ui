import { vi } from 'vitest'

export class SummaryPageController {
  constructor(model, pageDef) {
    this.model = model
    this.pageDef = pageDef
  }

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

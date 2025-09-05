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

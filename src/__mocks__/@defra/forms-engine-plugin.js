import { vi } from 'vitest'

// Mock the QuestionPageController class
export const QuestionPageController = class {
  constructor() {}
  
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

// Mock the SummaryPageController class
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

// Mock the entire plugin
const plugin = {
  name: 'forms-engine-plugin',
  register: vi.fn(),
  controllers: {
    QuestionPageController
  }
}

// Mock any specific functions used by tests
plugin.createServer = vi.fn().mockImplementation(() => {
  return {
    initialize: vi.fn().mockResolvedValue(true),
    stop: vi.fn().mockResolvedValue(true),
    inject: vi.fn().mockResolvedValue({ result: '', statusCode: 200 })
  }
})

export default plugin

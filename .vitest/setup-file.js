import { vi } from 'vitest'

vi.mock('@defra/forms-engine-plugin/controllers/QuestionPageController.js', () => {
  class QuestionPageController {
    constructor(page, model, options = {}) {
      this.page = page
      this.model = model
      this.options = options
      this.viewName = page?.name || 'default-view'
    }

    getViewModel(request, context) {
      return {
        pageTitle: this.page?.title || 'Default Title',
        ...context
      }
    }

    makeGetRouteHandler() {
      return () => ({ view: this.viewName })
    }

    makePostRouteHandler() {
      return () => ({ redirect: '/next' })
    }
  }

  return { QuestionPageController }
})

vi.mock('@defra/forms-engine-plugin/controllers/StatusPageController.js', () => {
  class StatusPageController {
    constructor(page, model, options = {}) {
      this.page = page
      this.model = model
      this.options = options
      this.viewName = page?.name || 'status-view'
    }

    makeGetRouteHandler() {
      return () => ({ view: this.viewName })
    }
  }

  return { StatusPageController }
})

vi.mock('@defra/forms-engine-plugin/controllers/SummaryPageController.js', () => {
  class SummaryPageController {
    constructor(page, model, options = {}) {
      this.page = page
      this.model = model
      this.options = options
      this.viewName = page?.name || 'summary-view'
    }

    getSummaryViewModel() {
      return {
        checkAnswers: [
          {
            summaryList: {
              rows: []
            }
          }
        ]
      }
    }

    makeGetRouteHandler() {
      return () => ({ view: this.viewName })
    }
  }

  return { SummaryPageController }
})

vi.mock('@defra/forms-engine-plugin', () => ({
  plugin: {
    name: 'forms-engine-plugin',
    register: vi.fn(),
    controllers: {}
  }
}))

vi.mock('@defra/forms-model')

vi.mock('@hapi/h2o2', () => ({
  default: { name: 'h2o2', register: vi.fn() },
  plugin: { name: 'h2o2', register: vi.fn() }
}))

vi.mock('hapi-pino', () => {
  const mockPlugin = {
    register: vi.fn(),
    name: 'hapi-pino'
  }
  return {
    default: mockPlugin,
    ...mockPlugin
  }
})

vi.mock('@hapi/jwt', () => {
  const mockJwt = {
    token: {
      generate: vi.fn(() => 'mocked-jwt-token'),
      decode: vi.fn(() => ({ exp: Date.now() + 10000 })),
      verifyTime: vi.fn()
    }
  }
  return {
    default: mockJwt,
    ...mockJwt
  }
})

vi.mock('~/src/server/index.js', () => ({
  createServer: vi.fn(() => {
    const mockServer = {
      inject: vi.fn().mockResolvedValue({
        result: { message: 'success' },
        statusCode: 200,
        headers: {}
      }),
      initialize: vi.fn().mockResolvedValue(),
      stop: vi.fn().mockResolvedValue(),
      register: vi.fn().mockResolvedValue(),
      route: vi.fn(),
      start: vi.fn().mockResolvedValue(),
      app: {
        cache: {
          get: vi.fn(),
          set: vi.fn(),
          drop: vi.fn()
        }
      },
      auth: {
        strategy: vi.fn(),
        default: vi.fn(),
        scheme: vi.fn(),
        test: vi.fn()
      },
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn()
      }
    }
    return mockServer
  })
}))

vi.mock('@hapi/wreck', () => {
  const mockGet = vi.fn()
  const mockPost = vi.fn()
  const mockPut = vi.fn()
  const mockDelete = vi.fn()

  return {
    default: {
      get: mockGet,
      post: mockPost,
      put: mockPut,
      delete: mockDelete
    },
    get: mockGet,
    post: mockPost,
    put: mockPut,
    delete: mockDelete
  }
})

// Set up global fetch
global.fetch = globalThis.fetch || vi.fn()

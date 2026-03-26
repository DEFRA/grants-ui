import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSumValidatedController } from './sum-validated-task-page.controller.js'

vi.mock('@defra/forms-engine-plugin/controllers/QuestionPageController.js', () => {
  return {
    QuestionPageController: class {
      constructor(model, pageDef) {
        this.model = model
        this.pageDef = pageDef
        this.collection = {
          getViewErrors: vi.fn((errors) => errors)
        }
      }

      getViewModel(request, context) {
        return {
          serviceUrl: '/service',
          page: {
            model: this.model,
            def: {
              ...this.pageDef,
              metadata: { tasklist: {} }
            }
          }
        }
      }

      makePostRouteHandler() {
        return vi.fn().mockResolvedValue('parent post response')
      }

      setState() {
        return Promise.resolve()
      }

      proceed() {
        return 'proceeded'
      }

      getNextPath() {
        return '/next-path'
      }

      filterConditionalComponents() {
        return []
      }
    }
  }
})

vi.mock('~/src/server/task-list/task-list.helper.js', () => ({
  getTaskListPath: vi.fn().mockReturnValue('/task-list'),
  getTaskPageBackLink: vi.fn()
}))

const testRules = {
  '/page-single-field': {
    fieldName: 'fieldA',
    sumFields: ['fieldA'],
    maxField: 'maxField',
    errorText: (remaining) => `Must not exceed max. You have ${remaining} remaining`
  },
  '/page-multi-field': {
    fieldName: 'fieldB',
    sumFields: ['fieldA', 'fieldB'],
    maxField: 'maxField',
    errorText: (remaining) => `Combined must not exceed max. You have ${remaining} remaining`
  }
}

const mockH = { view: vi.fn().mockReturnValue('error view') }

describe('createSumValidatedController', () => {
  let Controller
  let mockModel

  beforeEach(() => {
    vi.clearAllMocks()
    Controller = createSumValidatedController(testRules)
    mockModel = {
      def: { metadata: { tasklist: {} } }
    }
  })

  it('should return a controller class', () => {
    expect(typeof Controller).toBe('function')
  })

  describe('single field validation', () => {
    it('should set error when field exceeds max', async () => {
      const controller = new Controller(mockModel, { path: '/page-single-field' })
      const handler = controller.makePostRouteHandler()

      const context = { state: { maxField: 50 }, evaluationState: {} }
      const request = { payload: { fieldA: '60' } }

      await handler(request, context, mockH)

      expect(context.errors).toEqual([
        {
          path: ['fieldA'],
          href: '#fieldA',
          name: 'fieldA',
          text: 'Must not exceed max. You have 50 remaining'
        }
      ])
    })

    it.each([
      { value: '50', desc: 'equals max' },
      { value: '30', desc: 'under max' }
    ])('should not set error when field $desc', async ({ value }) => {
      const controller = new Controller(mockModel, { path: '/page-single-field' })
      const handler = controller.makePostRouteHandler()

      const context = { state: { maxField: 50 } }

      await handler({ payload: { fieldA: value } }, context, mockH)

      expect(context.errors).toBeUndefined()
    })
  })

  describe('multi field validation', () => {
    it('should set error when combined fields exceed max', async () => {
      const controller = new Controller(mockModel, { path: '/page-multi-field' })
      const handler = controller.makePostRouteHandler()

      const context = { state: { maxField: 50, fieldA: 30 }, evaluationState: {} }
      const request = { payload: { fieldB: '25' } }

      await handler(request, context, mockH)

      expect(context.errors).toEqual([
        {
          path: ['fieldB'],
          href: '#fieldB',
          name: 'fieldB',
          text: 'Combined must not exceed max. You have 20 remaining'
        }
      ])
    })

    it.each([
      { fieldAState: 30, value: '20', desc: 'equals max' },
      { fieldAState: 20, value: '10', desc: 'under max' }
    ])('should not set error when combined fields $desc', async ({ fieldAState, value }) => {
      const controller = new Controller(mockModel, { path: '/page-multi-field' })
      const handler = controller.makePostRouteHandler()

      const context = { state: { maxField: 50, fieldA: fieldAState } }

      await handler({ payload: { fieldB: value } }, context, mockH)

      expect(context.errors).toBeUndefined()
    })

    it('should calculate remaining based on other fields only', async () => {
      const controller = new Controller(mockModel, { path: '/page-multi-field' })
      const handler = controller.makePostRouteHandler()

      const context = { state: { maxField: 100, fieldA: 40 }, evaluationState: {} }
      const request = { payload: { fieldB: '70' } }

      await handler(request, context, mockH)

      expect(context.errors[0].text).toBe('Combined must not exceed max. You have 60 remaining')
    })
  })

  describe('no matching rule', () => {
    it('should pass through to parent handler when page has no rule', async () => {
      const controller = new Controller(mockModel, { path: '/unrelated-page' })
      const handler = controller.makePostRouteHandler()

      const context = { state: {} }
      const request = { payload: {} }

      await handler(request, context, mockH)

      expect(context.errors).toBeUndefined()
    })
  })

  describe('edge cases', () => {
    it('should use payload value over state value for current field', async () => {
      const controller = new Controller(mockModel, { path: '/page-single-field' })
      const handler = controller.makePostRouteHandler()

      const context = { state: { maxField: 50, fieldA: 10 }, evaluationState: {} }
      const request = { payload: { fieldA: '60' } }

      await handler(request, context, mockH)

      expect(context.errors).toBeDefined()
    })

    it('should fall back to state when payload is missing field', async () => {
      const controller = new Controller(mockModel, { path: '/page-single-field' })
      const handler = controller.makePostRouteHandler()

      const context = { state: { maxField: 50, fieldA: 30 } }
      const request = { payload: {} }

      await handler(request, context, mockH)

      expect(context.errors).toBeUndefined()
    })
  })
})

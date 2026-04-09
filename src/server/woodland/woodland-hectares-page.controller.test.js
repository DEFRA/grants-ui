import { beforeEach, describe, expect, it, vi } from 'vitest'
import WoodlandHectaresPageController from './woodland-hectares-page.controller.js'

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

const mockH = { view: vi.fn().mockReturnValue('error view') }

describe('WoodlandHectaresPageController', () => {
  let controller
  let mockModel

  beforeEach(() => {
    vi.clearAllMocks()
    mockModel = { def: { metadata: { tasklist: {} } } }
    controller = new WoodlandHectaresPageController(mockModel, { path: '/total-area-of-woodland' })
  })

  describe('non-numeric input', () => {
    it.each([
      { overTen: 'abc', underTen: '10', desc: 'over-10 is not a number' },
      { overTen: '10', underTen: 'abc', desc: 'under-10 is not a number' },
      { overTen: 'abc', underTen: 'xyz', desc: 'both are not numbers' }
    ])('delegates to parent handler when $desc', async ({ overTen, underTen }) => {
      const handler = controller.makePostRouteHandler()
      const context = { state: { totalHectaresAppliedFor: 50 } }

      await handler({ payload: { hectaresTenOrOverYearsOld: overTen, hectaresUnderTenYearsOld: underTen } }, context, mockH)

      expect(context.errors).toBeUndefined()
    })
  })

  describe('minimum 0.5 ha total', () => {
    it('sets errors on both fields when both are empty', async () => {
      const handler = controller.makePostRouteHandler()
      const context = { state: { totalHectaresAppliedFor: 50 }, evaluationState: {} }

      await handler({ payload: {} }, context, mockH)

      expect(context.errors).toEqual([
        {
          path: ['hectaresTenOrOverYearsOld'],
          href: '#hectaresTenOrOverYearsOld',
          name: 'hectaresTenOrOverYearsOld',
          text: 'Enter the total area of woodland over 10 years old'
        },
        {
          path: ['hectaresUnderTenYearsOld'],
          href: '#hectaresUnderTenYearsOld',
          name: 'hectaresUnderTenYearsOld',
          text: 'Enter the total area of newly planted woodland under 10 years old'
        }
      ])
    })

    it('sets error only on missing field when one is empty', async () => {
      const handler = controller.makePostRouteHandler()
      const context = { state: { totalHectaresAppliedFor: 50 }, evaluationState: {} }

      await handler({ payload: { hectaresTenOrOverYearsOld: '10' } }, context, mockH)

      expect(context.errors).toEqual([
        {
          path: ['hectaresUnderTenYearsOld'],
          href: '#hectaresUnderTenYearsOld',
          name: 'hectaresUnderTenYearsOld',
          text: 'Enter the total area of newly planted woodland under 10 years old'
        }
      ])
    })

    it.each([
      { overTen: '0.2', underTen: '0.2', desc: 'combined exactly 0.4' },
      { overTen: '0.4', underTen: '0', desc: 'only over-10 below minimum' }
    ])('sets error when combined total is below 0.5 ha ($desc)', async ({ overTen, underTen }) => {
      const handler = controller.makePostRouteHandler()
      const context = { state: { totalHectaresAppliedFor: 50 }, evaluationState: {} }

      await handler({ payload: { hectaresTenOrOverYearsOld: overTen, hectaresUnderTenYearsOld: underTen } }, context, mockH)

      expect(context.errors).toEqual([
        {
          path: ['hectaresUnderTenYearsOld'],
          href: '#hectaresUnderTenYearsOld',
          name: 'hectaresUnderTenYearsOld',
          text: 'The total area of woodland must be larger than 0.5 ha'
        }
      ])
    })

    it.each([
      { overTen: '0.5', underTen: '0', desc: 'exactly 0.5 ha' },
      { overTen: '0.3', underTen: '0.2', desc: 'combined exactly 0.5 ha' },
      { overTen: '1', underTen: '0', desc: 'above minimum' }
    ])('does not set minimum error when combined total is at least 0.5 ha ($desc)', async ({ overTen, underTen }) => {
      const handler = controller.makePostRouteHandler()
      const context = { state: { totalHectaresAppliedFor: 50 } }

      await handler({ payload: { hectaresTenOrOverYearsOld: overTen, hectaresUnderTenYearsOld: underTen } }, context, mockH)

      expect(context.errors).toBeUndefined()
    })
  })

  describe('exceeds total land parcel area', () => {
    it('sets error on over-10 field when it alone exceeds max', async () => {
      const handler = controller.makePostRouteHandler()
      const context = { state: { totalHectaresAppliedFor: 50 }, evaluationState: {} }

      await handler({ payload: { hectaresTenOrOverYearsOld: '60', hectaresUnderTenYearsOld: '0' } }, context, mockH)

      expect(context.errors).toEqual([
        {
          path: ['hectaresTenOrOverYearsOld'],
          href: '#hectaresTenOrOverYearsOld',
          name: 'hectaresTenOrOverYearsOld',
          text: 'Area of woodland over 10 years old must not be more than the total area of land parcels. You have 50 ha available'
        }
      ])
    })

    it('sets error on under-10 field when combined total exceeds max', async () => {
      const handler = controller.makePostRouteHandler()
      const context = { state: { totalHectaresAppliedFor: 50 }, evaluationState: {} }

      await handler({ payload: { hectaresTenOrOverYearsOld: '30', hectaresUnderTenYearsOld: '25' } }, context, mockH)

      expect(context.errors).toEqual([
        {
          path: ['hectaresUnderTenYearsOld'],
          href: '#hectaresUnderTenYearsOld',
          name: 'hectaresUnderTenYearsOld',
          text: 'Combined area of woodland over 10 years old and under 10 years old must not be more than the total area of land parcels. You have 20 ha remaining'
        }
      ])
    })

    it('calculates remaining correctly based on over-10 value', async () => {
      const handler = controller.makePostRouteHandler()
      const context = { state: { totalHectaresAppliedFor: 100 }, evaluationState: {} }

      await handler({ payload: { hectaresTenOrOverYearsOld: '40', hectaresUnderTenYearsOld: '70' } }, context, mockH)

      expect(context.errors[0].text).toBe(
        'Combined area of woodland over 10 years old and under 10 years old must not be more than the total area of land parcels. You have 60 ha remaining'
      )
    })

    it.each([
      { overTen: '50', underTen: '0', desc: 'over-10 equals max' },
      { overTen: '30', underTen: '20', desc: 'combined equals max' },
      { overTen: '20', underTen: '10', desc: 'combined under max' }
    ])('does not set error when $desc', async ({ overTen, underTen }) => {
      const handler = controller.makePostRouteHandler()
      const context = { state: { totalHectaresAppliedFor: 50 } }

      await handler({ payload: { hectaresTenOrOverYearsOld: overTen, hectaresUnderTenYearsOld: underTen } }, context, mockH)

      expect(context.errors).toBeUndefined()
    })
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import WoodlandHectaresPageController from './woodland-hectares-page.controller.js'
import * as woodlandService from './woodland.service.js'

vi.mock('./woodland.service.js', () => ({
  validateWoodlandHectares: vi.fn().mockResolvedValue([])
}))

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
    it('sets error on over-10 field when it is not a number', async () => {
      const handler = controller.makePostRouteHandler()
      const context = { state: { totalHectaresAppliedFor: 50 }, evaluationState: {} }

      await handler({ payload: { hectaresTenOrOverYearsOld: 'abc', hectaresUnderTenYearsOld: '10' } }, context, mockH)

      expect(context.errors).toEqual([
        {
          path: ['hectaresTenOrOverYearsOld'],
          href: '#hectaresTenOrOverYearsOld',
          name: 'hectaresTenOrOverYearsOld',
          text: 'Enter the total area of woodland over 10 years old'
        }
      ])
    })

    it('sets error on under-10 field when it is not a number', async () => {
      const handler = controller.makePostRouteHandler()
      const context = { state: { totalHectaresAppliedFor: 50 }, evaluationState: {} }

      await handler({ payload: { hectaresTenOrOverYearsOld: '10', hectaresUnderTenYearsOld: 'abc' } }, context, mockH)

      expect(context.errors).toEqual([
        {
          path: ['hectaresUnderTenYearsOld'],
          href: '#hectaresUnderTenYearsOld',
          name: 'hectaresUnderTenYearsOld',
          text: 'Enter the total area of newly planted woodland under 10 years old'
        }
      ])
    })

    it('sets errors on both fields when both are not numbers', async () => {
      const handler = controller.makePostRouteHandler()
      const context = { state: { totalHectaresAppliedFor: 50 }, evaluationState: {} }

      await handler({ payload: { hectaresTenOrOverYearsOld: 'abc', hectaresUnderTenYearsOld: 'xyz' } }, context, mockH)

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

  describe('backend validation', () => {
    const validPayload = { hectaresTenOrOverYearsOld: '10', hectaresUnderTenYearsOld: '5' }
    const validState = { totalHectaresAppliedFor: 50, selectedParcelIds: ['SD6346-3387'] }

    it('calls the service with parcel IDs and hectare values from payload', async () => {
      const handler = controller.makePostRouteHandler()
      const context = { state: validState }

      await handler({ payload: validPayload }, context, mockH)

      expect(woodlandService.validateWoodlandHectares).toHaveBeenCalledWith({
        parcelIds: ['SD6346-3387'],
        oldWoodlandAreaHa: 10,
        newWoodlandAreaHa: 5
      })
    })

    it('sets errors from failed rules returned by the service', async () => {
      woodlandService.validateWoodlandHectares.mockResolvedValueOnce([
        'The woodland area over 10 years old (10 ha) does not meet the minimum required area of (0.5 ha)'
      ])
      const handler = controller.makePostRouteHandler()
      const context = { state: validState, evaluationState: {} }

      await handler({ payload: validPayload }, context, mockH)

      expect(context.errors).toEqual([
        {
          path: ['hectaresTenOrOverYearsOld'],
          href: '#hectaresTenOrOverYearsOld',
          name: 'hectaresTenOrOverYearsOld',
          text: 'The woodland area over 10 years old (10 ha) does not meet the minimum required area of (0.5 ha)'
        }
      ])
    })

    it('renders a top-level error when the service throws', async () => {
      woodlandService.validateWoodlandHectares.mockRejectedValueOnce(new Error('Network failure'))
      const handler = controller.makePostRouteHandler()
      const context = { state: validState, evaluationState: {} }

      await handler({ payload: validPayload }, context, mockH)

      expect(context.errors).toBeUndefined()
      expect(mockH.view).toHaveBeenCalled()
      const [[, viewModel]] = mockH.view.mock.calls
      expect(viewModel.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: [],
            text: 'There has been an issue validating your woodland area. Please try again later or contact the Rural Payments Agency.'
          })
        ])
      )
    })

    it('does not set errors when the service returns no failures', async () => {
      const handler = controller.makePostRouteHandler()
      const context = { state: validState }

      await handler({ payload: validPayload }, context, mockH)

      expect(context.errors).toBeUndefined()
    })
  })
})

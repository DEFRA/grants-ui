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
          },
          components: [
            {
              type: 'Html',
              isFormComponent: false,
              model: { content: '{{ totalHectaresAppliedFor }} ha' }
            }
          ]
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

  describe('getViewModel', () => {
    it('renders hectares guidance content with totalHectaresAppliedFor from state', () => {
      const context = { state: { totalHectaresAppliedFor: 42 }, evaluationState: {} }
      const viewModel = controller.getViewModel({}, context)

      expect(viewModel.totalHectaresAppliedFor).toBe(42)
      expect(viewModel.components[0].model.content).toContain('42 ha')
    })

    it('defaults totalHectaresAppliedFor to 0 when missing from state', () => {
      const context = { state: {}, evaluationState: {} }
      const viewModel = controller.getViewModel({}, context)

      expect(viewModel.totalHectaresAppliedFor).toBe(0)
      expect(viewModel.components[0].model.content).toContain('0 ha')
    })
  })

  describe('non-numeric input', () => {
    it('sets error on over-10 field when it is not a number', async () => {
      const handler = controller.makePostRouteHandler()
      const context = { state: { totalHectaresAppliedFor: 50 }, evaluationState: {} }

      await handler({ payload: { oldWoodlandAreaHa: 'abc', newWoodlandAreaHa: '10' } }, context, mockH)

      expect(context.errors).toEqual([
        {
          path: ['oldWoodlandAreaHa'],
          href: '#oldWoodlandAreaHa',
          name: 'oldWoodlandAreaHa',
          text: 'The total area of woodland must be more than 0.5ha'
        }
      ])
    })

    it('sets error on under-10 field when it is not a number', async () => {
      const handler = controller.makePostRouteHandler()
      const context = { state: { totalHectaresAppliedFor: 50 }, evaluationState: {} }

      await handler({ payload: { oldWoodlandAreaHa: '10', newWoodlandAreaHa: 'abc' } }, context, mockH)

      expect(context.errors).toEqual([
        {
          path: ['newWoodlandAreaHa'],
          href: '#newWoodlandAreaHa',
          name: 'newWoodlandAreaHa',
          text: 'The total area of woodland must be more than 0.5ha'
        }
      ])
    })

    it('sets errors on both fields when both are not numbers', async () => {
      const handler = controller.makePostRouteHandler()
      const context = { state: { totalHectaresAppliedFor: 50 }, evaluationState: {} }

      await handler({ payload: { oldWoodlandAreaHa: 'abc', newWoodlandAreaHa: 'xyz' } }, context, mockH)

      expect(context.errors).toEqual([
        {
          path: ['oldWoodlandAreaHa'],
          href: '#oldWoodlandAreaHa',
          name: 'oldWoodlandAreaHa',
          text: 'The total area of woodland must be more than 0.5ha'
        },
        {
          path: ['newWoodlandAreaHa'],
          href: '#newWoodlandAreaHa',
          name: 'newWoodlandAreaHa',
          text: 'The total area of woodland must be more than 0.5ha'
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
          path: ['oldWoodlandAreaHa'],
          href: '#oldWoodlandAreaHa',
          name: 'oldWoodlandAreaHa',
          text: 'The total area of woodland must be more than 0.5ha'
        },
        {
          path: ['newWoodlandAreaHa'],
          href: '#newWoodlandAreaHa',
          name: 'newWoodlandAreaHa',
          text: 'The total area of woodland must be more than 0.5ha'
        }
      ])
    })

    it('sets error only on missing field when one is empty', async () => {
      const handler = controller.makePostRouteHandler()
      const context = { state: { totalHectaresAppliedFor: 50 }, evaluationState: {} }

      await handler({ payload: { oldWoodlandAreaHa: '10' } }, context, mockH)

      expect(context.errors).toEqual([
        {
          path: ['newWoodlandAreaHa'],
          href: '#newWoodlandAreaHa',
          name: 'newWoodlandAreaHa',
          text: 'The total area of woodland must be more than 0.5ha'
        }
      ])
    })

    it.each([
      { overTen: '0.2', underTen: '0.2', desc: 'combined exactly 0.4' },
      { overTen: '0.4', underTen: '0', desc: 'only over-10 below minimum' }
    ])('sets error when combined total is below 0.5 ha ($desc)', async ({ overTen, underTen }) => {
      const handler = controller.makePostRouteHandler()
      const context = { state: { totalHectaresAppliedFor: 50 }, evaluationState: {} }

      await handler({ payload: { oldWoodlandAreaHa: overTen, newWoodlandAreaHa: underTen } }, context, mockH)

      expect(context.errors).toEqual([
        {
          path: ['oldWoodlandAreaHa'],
          href: '#oldWoodlandAreaHa',
          name: 'oldWoodlandAreaHa',
          text: 'The total area of woodland must be more than 0.5ha'
        },
        {
          path: ['newWoodlandAreaHa'],
          href: '#oldWoodlandAreaHa',
          text: 'The total area of woodland must be more than 0.5ha'
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

      await handler({ payload: { oldWoodlandAreaHa: overTen, newWoodlandAreaHa: underTen } }, context, mockH)

      expect(context.errors).toBeUndefined()
    })
  })

  describe('exceeds total land parcel area', () => {
    it.each([
      { overTen: '60', underTen: '0', desc: 'over-10 alone exceeds max' },
      { overTen: '30', underTen: '25', desc: 'combined total exceeds max' }
    ])('sets error on both fields when $desc', async ({ overTen, underTen }) => {
      const handler = controller.makePostRouteHandler()
      const context = { state: { totalHectaresAppliedFor: 50 }, evaluationState: {} }

      await handler({ payload: { oldWoodlandAreaHa: overTen, newWoodlandAreaHa: underTen } }, context, mockH)

      expect(context.errors).toEqual([
        {
          path: ['oldWoodlandAreaHa'],
          href: '#oldWoodlandAreaHa',
          name: 'oldWoodlandAreaHa',
          text: 'Total area of woodland cannot be more than total area of selected land parcels (50ha)'
        },
        {
          path: ['newWoodlandAreaHa'],
          href: '#oldWoodlandAreaHa',
          text: 'Total area of woodland cannot be more than total area of selected land parcels (50ha)'
        }
      ])
    })

    it.each([
      { overTen: '50', underTen: '0', desc: 'over-10 equals max' },
      { overTen: '30', underTen: '20', desc: 'combined equals max' },
      { overTen: '20', underTen: '10', desc: 'combined under max' }
    ])('does not set error when $desc', async ({ overTen, underTen }) => {
      const handler = controller.makePostRouteHandler()
      const context = { state: { totalHectaresAppliedFor: 50 } }

      await handler({ payload: { oldWoodlandAreaHa: overTen, newWoodlandAreaHa: underTen } }, context, mockH)

      expect(context.errors).toBeUndefined()
    })
  })

  describe('backend validation', () => {
    const validPayload = { oldWoodlandAreaHa: '10', newWoodlandAreaHa: '5' }
    const validState = { totalHectaresAppliedFor: 50, landParcels: ['SD6346-3387'] }

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
          path: ['oldWoodlandAreaHa'],
          href: '#oldWoodlandAreaHa',
          name: 'oldWoodlandAreaHa',
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

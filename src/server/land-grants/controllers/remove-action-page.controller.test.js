import { afterEach, beforeEach, describe, expect, it, test, vi } from 'vitest'
import RemoveActionPageController from './remove-action-page.controller.js'
import { YarKeys } from '~/src/server/common/constants/session-keys.js'

// The engine base supplies `getHref`; the shared test mock does not, so stand it
// in here rather than changing global test infrastructure. Mirrors
// `PageController.getHref`: prefix the base path, collapse repeated slashes.
const stubGetHref = (controller) => {
  controller.getHref = (target) => `/test-grant/${target ?? ''}`.replace(/\/{2,}/g, '/')
}

const ACTION_HEADING =
  'Do you want to remove Assess moorland and produce a written record: CMOR1 from land parcel SD6743 8083?'
const ACTION_HINT =
  'Select yes to remove this action from this land parcel. You can add a different action to the same parcel.'
const ACTION_ERROR = 'Select yes to remove this action from this land parcel'

describe('RemoveActionPageController', () => {
  let controller
  let mockRequest
  let mockContext
  let mockH

  const mockLandParcels = {
    'SD6743-8083': {
      actionsObj: {
        CMOR1: {
          description: 'Assess moorland and produce a written record: CMOR1',
          value: '4.53',
          unit: 'ha'
        },
        UPL1: {
          description: 'Moderate livestock grazing on moorland: UPL1',
          value: '2.5',
          unit: 'ha'
        }
      }
    },
    'SD6944-0085': {
      actionsObj: {
        CMOR1: {
          description: 'Assess moorland and produce a written record: CMOR1',
          value: '1.0',
          unit: 'ha'
        }
      }
    }
  }

  // Route identity is what selects the branch, so every controller under test is
  // built from a real `pageDef.path`.
  const buildController = ({ path = '/remove-action', returnPath } = {}) => {
    const pageDef = { path }
    const model = {
      def: {
        metadata: {
          tasklist: {},
          ...(returnPath === undefined ? {} : { pageConfig: { [path]: { returnPath } } })
        }
      },
      getSection: vi.fn()
    }
    const built = new RemoveActionPageController(model, pageDef)
    stubGetHref(built)
    built.setState = vi.fn().mockResolvedValue(true)
    built.proceed = vi.fn().mockReturnValue('redirected')
    built.performAuthCheck = vi.fn().mockResolvedValue(null)
    // Mirrors the engine: the back link comes from the `getBackLink` hook, so
    // the controller's override is exercised rather than hand-fed.
    built.getViewModel = vi.fn((request, context) => ({
      pageTitle: 'Remove action',
      serviceUrl: '/test-grant',
      backLink: built.getBackLink(request, context)
    }))
    return built
  }

  beforeEach(() => {
    controller = buildController()

    mockRequest = {
      query: {
        parcelId: 'SD6743-8083',
        action: 'CMOR1'
      },
      payload: {},
      yar: {
        get: vi.fn(),
        set: vi.fn(),
        clear: vi.fn()
      },
      auth: {
        isAuthenticated: true,
        credentials: {
          sbi: '106284736',
          crn: '1102838829',
          name: 'John Doe',
          organisationName: 'Farm 1',
          role: 'admin',
          sessionId: 'valid-session-id'
        }
      }
    }

    mockContext = {
      state: {
        landParcels: mockLandParcels
      }
    }

    mockH = {
      view: vi.fn().mockReturnValue('rendered view')
    }
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('getNextPathAfterRemoval', () => {
    test('should return check page when parcel has remaining actions', () => {
      const newState = {
        landParcels: {
          'SD6743-8083': {
            actionsObj: {
              UPL1: { description: 'Moderate livestock grazing on moorland' }
            }
          }
        }
      }

      const result = controller.getNextPathAfterRemoval(newState, 'SD6743-8083', 'CMOR1')

      expect(result).toBe('/check-selected-land-actions')
    })

    test('should return check page when there are other parcels on the state', () => {
      const newState = {
        landParcels: {
          'SD6743-8084': {
            actionsObj: {
              UPL1: { description: 'Moderate livestock grazing on moorland' }
            }
          }
        }
      }

      const result = controller.getNextPathAfterRemoval(newState, 'SD6743-8083', undefined)

      expect(result).toBe('/check-selected-land-actions')
    })

    test('should return select actions page when removing the last action on the parcel', () => {
      const newState = { landParcels: {} }

      const result = controller.getNextPathAfterRemoval(newState, 'SD6743-8083', 'CMOR1')

      expect(result).toBe('/select-actions-for-land-parcel?parcelId=SD6743-8083')
    })

    test('should return select land parcel page when removing the last parcel', () => {
      const newState = {
        landParcels: {}
      }

      const result = controller.getNextPathAfterRemoval(newState, 'SD6743-8083', undefined)

      expect(result).toBe('/select-land-parcel')
    })
  })

  describe('makeGetRouteHandler', () => {
    test('should extract parcel info and render view with action details', async () => {
      const handler = controller.makeGetRouteHandler()

      const result = await handler(mockRequest, mockContext, mockH)

      expect(controller.performAuthCheck).toHaveBeenCalledWith(mockRequest, mockH, [mockRequest.query.parcelId])
      expect(mockH.view).toHaveBeenCalledWith('remove-action', {
        pageTitle: 'Remove action',
        serviceUrl: '/test-grant',
        backLink: { text: 'Back', href: '/test-grant/check-selected-land-actions' },
        parcelId: 'SD6743-8083',
        pageHeading: ACTION_HEADING,
        hint: ACTION_HINT,
        isParcelRemoval: false
      })
      expect(result).toBe('rendered view')
    })

    test('renders the whole-parcel confirmation on /remove-parcel', async () => {
      const parcelController = buildController({ path: '/remove-parcel' })
      mockRequest.query = { parcelId: 'SD6743-8083' }

      const result = await parcelController.makeGetRouteHandler()(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith('remove-action', {
        pageTitle: 'Remove action',
        serviceUrl: '/test-grant',
        backLink: { text: 'Back', href: '/test-grant/check-selected-land-actions' },
        parcelId: 'SD6743-8083',
        pageHeading: 'Remove all actions from SD6743 8083?',
        hint: 'This will remove SD6743 8083 and all actions added to it from your application.',
        isParcelRemoval: true
      })
      expect(result).toBe('rendered view')
    })

    test('ignores a stray action query on /remove-parcel', async () => {
      const parcelController = buildController({ path: '/remove-parcel' })
      mockRequest.query = { parcelId: 'SD6743-8083', action: 'CMOR1' }

      await parcelController.makeGetRouteHandler()(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'remove-action',
        expect.objectContaining({
          pageHeading: 'Remove all actions from SD6743 8083?',
          isParcelRemoval: true
        })
      )
      expect(parcelController.proceed).not.toHaveBeenCalled()
    })

    test('should redirect to check page when parcel and action not provided', async () => {
      mockRequest.query = {}

      const handler = controller.makeGetRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/check-selected-land-actions')
      expect(mockH.view).not.toHaveBeenCalled()
      expect(result).toBe('redirected')
    })

    test('should redirect to check page when parcel not found', async () => {
      mockRequest.query = { parcelId: 'nonexistent-parcel', action: 'CMOR1' }

      const handler = controller.makeGetRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/check-selected-land-actions')
      expect(result).toBe('redirected')
    })

    test.each([[undefined], ['NOPE']])(
      'redirects without rendering when /remove-action cannot resolve the action %p',
      async (action) => {
        mockRequest.query = { parcelId: 'SD6743-8083', ...(action === undefined ? {} : { action }) }

        const result = await controller.makeGetRouteHandler()(mockRequest, mockContext, mockH)

        expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/check-selected-land-actions')
        expect(mockH.view).not.toHaveBeenCalled()
        expect(result).toBe('redirected')
      }
    )

    describe('when the user does not own the land parcel', () => {
      it('should return unauthorized response when user does not own the selected land parcel', async () => {
        controller.performAuthCheck.mockResolvedValue('failed auth check')

        const handler = controller.makeGetRouteHandler()

        const result = await handler(mockRequest, mockContext, mockH)

        expect(controller.performAuthCheck).toHaveBeenCalledWith(mockRequest, mockH, [mockRequest.query.parcelId])

        expect(result).toEqual('failed auth check')
      })
    })
  })

  describe('makePostRouteHandler', () => {
    test('should show validation error when remove not provided on /remove-action', async () => {
      mockRequest.payload = {}

      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith('remove-action', {
        pageTitle: 'Remove action',
        serviceUrl: '/test-grant',
        backLink: { text: 'Back', href: '/test-grant/check-selected-land-actions' },
        parcelId: 'SD6743-8083',
        pageHeading: ACTION_HEADING,
        hint: ACTION_HINT,
        isParcelRemoval: false,
        errors: ACTION_ERROR
      })
      expect(controller.setState).not.toHaveBeenCalled()
      expect(result).toBe('rendered view')
    })

    test('should remove action and redirect to check page when other actions remain', async () => {
      mockRequest.payload = { remove: 'true' }
      mockRequest.query = { parcelId: 'SD6743-8083', action: 'CMOR1' }

      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(controller.performAuthCheck).toHaveBeenCalledWith(mockRequest, mockH, [mockRequest.query.parcelId])

      expect(controller.setState).toHaveBeenCalledWith(
        mockRequest,
        expect.objectContaining({
          landParcels: expect.objectContaining({
            'SD6743-8083': expect.objectContaining({
              actionsObj: expect.objectContaining({
                UPL1: expect.anything()
              })
            })
          })
        })
      )
      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/check-selected-land-actions')
      expect(result).toBe('redirected')
    })

    test('should remove entire parcel when the whole-parcel page is confirmed', async () => {
      const parcelController = buildController({ path: '/remove-parcel' })
      mockRequest.query = { parcelId: 'SD6743-8083' }
      mockRequest.payload = { remove: 'true' }

      const result = await parcelController.makePostRouteHandler()(mockRequest, mockContext, mockH)

      expect(parcelController.setState).toHaveBeenCalledWith(
        mockRequest,
        expect.objectContaining({
          landParcels: expect.not.objectContaining({
            'SD6743-8083': expect.anything()
          })
        })
      )
      expect(parcelController.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/check-selected-land-actions')
      expect(result).toBe('redirected')
    })

    test.each([[{}], [{ remove: 'TRUE' }]])(
      'leaves state untouched when the whole-parcel page posts %p',
      async (payload) => {
        const parcelController = buildController({ path: '/remove-parcel' })
        mockRequest.query = { parcelId: 'SD6743-8083' }
        mockRequest.payload = payload

        const result = await parcelController.makePostRouteHandler()(mockRequest, mockContext, mockH)

        expect(parcelController.setState).not.toHaveBeenCalled()
        expect(mockH.view).not.toHaveBeenCalled()
        expect(parcelController.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/check-selected-land-actions')
        expect(result).toBe('redirected')
      }
    )

    test('should remove action and redirect to select actions when no actions remain', async () => {
      mockRequest.query = { parcelId: 'SD6944-0085', action: 'CMOR1' }
      mockRequest.payload = { remove: 'true' }

      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(controller.setState).toHaveBeenCalledWith(
        mockRequest,
        expect.objectContaining({
          landParcels: expect.not.objectContaining({
            'SD6944-0085': expect.anything()
          })
        })
      )
      expect(controller.proceed).toHaveBeenCalledWith(
        mockRequest,
        mockH,
        '/select-actions-for-land-parcel?parcelId=SD6944-0085'
      )
      expect(result).toBe('redirected')
    })

    test('should redirect to check page when user declines removal', async () => {
      mockRequest.payload = { remove: 'false' }

      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(controller.setState).not.toHaveBeenCalled()
      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/check-selected-land-actions')
      expect(result).toBe('redirected')
    })

    test('should handle null payload gracefully', async () => {
      mockRequest.payload = null
      mockRequest.query = { parcelId: 'SD6743-8083', action: 'CMOR1' }

      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'remove-action',
        expect.objectContaining({
          errors: ACTION_ERROR,
          hint: ACTION_HINT,
          pageHeading: ACTION_HEADING
        })
      )
      expect(result).toBe('rendered view')
    })

    test('redirects without rendering or mutating state when the posted action is unknown', async () => {
      mockRequest.query = { parcelId: 'SD6743-8083', action: 'NOPE' }
      mockRequest.payload = { remove: 'true' }

      const result = await controller.makePostRouteHandler()(mockRequest, mockContext, mockH)

      expect(controller.setState).not.toHaveBeenCalled()
      expect(mockH.view).not.toHaveBeenCalled()
      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/check-selected-land-actions')
      expect(result).toBe('redirected')
    })

    describe('when the user does not own the land parcel', () => {
      it('should return unauthorized response when user does not own the selected land parcel', async () => {
        mockRequest.query = { parcelId: 'SD6743-8083', action: 'CMOR1' }
        controller.performAuthCheck.mockResolvedValue('failed auth check')

        const handler = controller.makePostRouteHandler()

        const result = await handler(mockRequest, mockContext, mockH)

        expect(controller.performAuthCheck).toHaveBeenCalledWith(mockRequest, mockH, [mockRequest.query.parcelId])

        expect(result).toEqual('failed auth check')
      })
    })
  })

  describe('removal success marker', () => {
    const buildConfirmingParcelController = () =>
      buildController({ path: '/remove-parcel', returnPath: '/confirm-land-and-actions' })

    test('stores the removed parcel reference only after state has been written', async () => {
      const parcelController = buildConfirmingParcelController()
      mockRequest.query = { parcelId: 'SD6743-8083' }
      mockRequest.payload = { remove: 'true' }

      await parcelController.makePostRouteHandler()(mockRequest, mockContext, mockH)

      expect(mockRequest.yar.set).toHaveBeenCalledWith(YarKeys.LAND_PARCEL_REMOVAL_SUCCESS, 'SD6743 8083')
      expect(parcelController.setState.mock.invocationCallOrder[0]).toBeLessThan(
        mockRequest.yar.set.mock.invocationCallOrder[0]
      )
      expect(parcelController.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/confirm-land-and-actions')
    })

    test.each([[{}], [{ remove: 'false' }], [{ remove: 'nope' }]])(
      'stores nothing when the confirmation is not given (%p)',
      async (payload) => {
        const parcelController = buildConfirmingParcelController()
        mockRequest.query = { parcelId: 'SD6743-8083' }
        mockRequest.payload = payload

        await parcelController.makePostRouteHandler()(mockRequest, mockContext, mockH)

        expect(mockRequest.yar.set).not.toHaveBeenCalled()
      }
    )

    test('stores nothing when an action is removed', async () => {
      const actionController = buildController({ path: '/remove-action', returnPath: '/confirm-land-and-actions' })
      mockRequest.query = { parcelId: 'SD6743-8083', action: 'CMOR1' }
      mockRequest.payload = { remove: 'true' }

      await actionController.makePostRouteHandler()(mockRequest, mockContext, mockH)

      expect(actionController.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/confirm-land-and-actions')
      expect(mockRequest.yar.set).not.toHaveBeenCalled()
    })

    test('stores nothing when the destination is the default Farm Payments check page', async () => {
      const parcelController = buildController({ path: '/remove-parcel' })
      mockRequest.query = { parcelId: 'SD6743-8083' }
      mockRequest.payload = { remove: 'true' }

      await parcelController.makePostRouteHandler()(mockRequest, mockContext, mockH)

      expect(parcelController.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/check-selected-land-actions')
      expect(mockRequest.yar.set).not.toHaveBeenCalled()
    })

    test('stores nothing when the last parcel is removed', async () => {
      const parcelController = buildConfirmingParcelController()
      mockContext.state = { landParcels: { 'SD6743-8083': structuredClone(mockLandParcels['SD6743-8083']) } }
      mockRequest.query = { parcelId: 'SD6743-8083' }
      mockRequest.payload = { remove: 'true' }

      await parcelController.makePostRouteHandler()(mockRequest, mockContext, mockH)

      expect(parcelController.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/select-land-parcel')
      expect(mockRequest.yar.set).not.toHaveBeenCalled()
    })
  })

  describe('returnPath configuration', () => {
    const buildConfiguredController = (returnPath) => buildController({ path: '/remove-action', returnPath })

    test('defaults returnPath to /check-selected-land-actions when unconfigured', () => {
      expect(controller.returnPath).toBe('/check-selected-land-actions')
    })

    test('uses configured returnPath when parcels/actions remain', () => {
      const configured = buildConfiguredController('/confirm-land-and-actions')
      const newState = {
        landParcels: {
          'SD6743-8083': { actionsObj: { UPL1: { description: 'x' } } }
        }
      }
      expect(configured.getNextPathAfterRemoval(newState, 'SD6743-8083', 'CMOR1')).toBe('/confirm-land-and-actions')
    })

    test('preserves last-action and last-parcel special destinations', () => {
      const configured = buildConfiguredController('/confirm-land-and-actions')
      expect(configured.getNextPathAfterRemoval({ landParcels: {} }, 'SD6743-8083', 'CMOR1')).toBe(
        '/select-actions-for-land-parcel?parcelId=SD6743-8083'
      )
      expect(configured.getNextPathAfterRemoval({ landParcels: {} }, 'SD6743-8083', undefined)).toBe(
        '/select-land-parcel'
      )
    })

    test('GET redirects to configured returnPath when parcel not found', async () => {
      const configured = buildConfiguredController('/confirm-land-and-actions')
      mockRequest.query = {}
      await configured.makeGetRouteHandler()(mockRequest, mockContext, mockH)
      expect(configured.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/confirm-land-and-actions')
    })

    test('POST cancel redirects to configured returnPath', async () => {
      const configured = buildConfiguredController('/confirm-land-and-actions')
      mockRequest.query = { parcelId: 'SD6743-8083', action: 'CMOR1' }
      mockRequest.payload = { remove: 'false' }
      await configured.makePostRouteHandler()(mockRequest, mockContext, mockH)
      expect(configured.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/confirm-land-and-actions')
    })

    test('GET view Back link points at configured returnPath', async () => {
      const configured = buildConfiguredController('/confirm-land-and-actions')
      mockRequest.query = { parcelId: 'SD6743-8083', action: 'CMOR1' }
      await configured.makeGetRouteHandler()(mockRequest, mockContext, mockH)
      expect(mockH.view).toHaveBeenCalledWith(
        'remove-action',
        expect.objectContaining({
          backLink: { text: 'Back', href: '/test-grant/confirm-land-and-actions' }
        })
      )
    })

    test.each([[''], ['   '], [null], [123], [{}]])(
      'falls back to the default returnPath for the unusable config value %p',
      (returnPath) => {
        expect(buildConfiguredController(returnPath).returnPath).toBe('/check-selected-land-actions')
      }
    )

    test('trims a configured returnPath so the href is not malformed', () => {
      expect(buildConfiguredController('  /confirm-land-and-actions  ').returnPath).toBe('/confirm-land-and-actions')
    })

    test('normalises a configured returnPath that omits its leading slash', () => {
      const configured = buildConfiguredController('confirm-land-and-actions')

      expect(configured.getBackLink().href).toBe('/test-grant/confirm-land-and-actions')
    })

    test('POST removal redirects to configured returnPath when parcels remain', async () => {
      const configured = buildConfiguredController('/confirm-land-and-actions')
      mockRequest.query = { parcelId: 'SD6743-8083', action: 'CMOR1' }
      mockRequest.payload = { remove: 'true' }

      await configured.makePostRouteHandler()(mockRequest, mockContext, mockH)

      expect(configured.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/confirm-land-and-actions')
    })

    test('POST validation error view Back link points at configured returnPath', async () => {
      const configured = buildConfiguredController('/confirm-land-and-actions')
      mockRequest.query = { parcelId: 'SD6743-8083', action: 'CMOR1' }
      mockRequest.payload = {}

      await configured.makePostRouteHandler()(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'remove-action',
        expect.objectContaining({
          backLink: { text: 'Back', href: '/test-grant/confirm-land-and-actions' }
        })
      )
    })

    test('parcel-removal cancel redirects to configured returnPath', async () => {
      const configured = buildController({ path: '/remove-parcel', returnPath: '/confirm-land-and-actions' })
      mockRequest.query = { parcelId: 'SD6743-8083' }
      mockRequest.payload = {}

      await configured.makePostRouteHandler()(mockRequest, mockContext, mockH)

      expect(configured.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/confirm-land-and-actions')
    })
  })
})

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import RemoveActionPageController from './remove-action-page.controller.js'

// The engine base supplies `getHref`; the shared test mock does not, so stand it
// in here rather than changing global test infrastructure. Mirrors
// `PageController.getHref`: prefix the base path, collapse repeated slashes.
const stubGetHref = (controller) => {
  controller.getHref = (target) => `/test-grant/${target ?? ''}`.replace(/\/{2,}/g, '/')
}

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

  beforeEach(() => {
    const mockModel = { def: { metadata: { tasklist: {} } }, getSection: vi.fn() }
    controller = new RemoveActionPageController(mockModel, {})
    stubGetHref(controller)
    controller.setState = vi.fn().mockResolvedValue(true)
    controller.proceed = vi.fn().mockReturnValue('redirected')
    controller.performAuthCheck = vi.fn().mockResolvedValue(null)
    // Mirrors the engine: the back link comes from the `getBackLink` hook, so
    // the controller's override is exercised rather than hand-fed.
    controller.getViewModel = vi.fn((request, context) => ({
      pageTitle: 'Remove action',
      serviceUrl: '/test-grant',
      backLink: controller.getBackLink(request, context)
    }))

    mockRequest = {
      query: {
        parcelId: 'SD6743-8083',
        action: 'CMOR1'
      },
      payload: {},
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

  describe('validatePostPayload', () => {
    test('should return error with action description when remove is undefined and actionDescription exists', () => {
      const actionInfo = { description: 'Assess moorland and produce a written record: CMOR1' }
      const payload = {}

      const result = controller.validatePostPayload(payload, actionInfo)

      expect(result).toEqual({
        errorMessage: 'Select yes to remove this action from this land parcel'
      })
    })

    test('should return error for parcel removal when remove is undefined and actionDescription is null', () => {
      const actionInfo = {}
      const payload = {}

      const result = controller.validatePostPayload(payload, actionInfo)

      expect(result).toEqual({
        errorMessage: 'Select yes to remove this land parcel from this application'
      })
    })

    test('should return null when remove is true', () => {
      const payload = { remove: 'true' }
      const actionInfo = { description: 'Test action' }

      const result = controller.validatePostPayload(payload, actionInfo)

      expect(result).toBeNull()
    })

    test('should return null when remove is false', () => {
      const payload = { remove: 'false' }
      const actionInfo = { description: 'Test action' }

      const result = controller.validatePostPayload(payload, actionInfo)

      expect(result).toBeNull()
    })
  })

  describe('renderPostErrorView', () => {
    test('should render error view with all properties', () => {
      const parcel = 'SD6743-8083'
      const pageHeadingAndHint = { pageHeading: 'Test Action Description', hint: 'hint text is here' }
      controller.performAuthCheck = vi.fn().mockResolvedValue(null)

      const result = controller.renderPostErrorView(
        mockH,
        mockRequest,
        mockContext,
        'Test error message',
        parcel,
        pageHeadingAndHint
      )

      expect(controller.getViewModel).toHaveBeenCalledWith(mockRequest, mockContext)
      expect(mockH.view).toHaveBeenCalledWith('remove-action', {
        pageTitle: 'Remove action',
        serviceUrl: '/test-grant',
        backLink: { text: 'Back', href: '/test-grant/check-selected-land-actions' },
        parcelId: 'SD6743-8083',
        ...pageHeadingAndHint,
        errors: 'Test error message'
      })
      expect(result).toBe('rendered view')
    })
  })

  describe('processRemoval', () => {
    test('should remove specific action and redirect to check page when other actions remain', async () => {
      const action = 'CMOR1'
      const parcel = 'SD6743-8083'

      const state = {
        landParcels: structuredClone(mockLandParcels)
      }

      const result = await controller.processRemoval(mockRequest, state, mockH, parcel, action)

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

    test('should remove specific action and redirect to select page when no actions remain', async () => {
      const action = 'CMOR1'
      const parcel = 'SD6944-0085'

      const state = {
        landParcels: {
          'SD6944-0085': {
            actionsObj: {
              CMOR1: { description: 'Test action' }
            }
          }
        }
      }

      const result = await controller.processRemoval(mockRequest, state, mockH, parcel, action)

      expect(controller.setState).toHaveBeenCalledWith(mockRequest, {})
      expect(controller.proceed).toHaveBeenCalledWith(
        mockRequest,
        mockH,
        '/select-actions-for-land-parcel?parcelId=SD6944-0085'
      )
      expect(result).toBe('redirected')
    })

    test('should remove entire parcel when no action specified', async () => {
      const action = null
      const parcel = 'SD6743-8083'

      const state = {
        landParcels: structuredClone(mockLandParcels)
      }

      const result = await controller.processRemoval(mockRequest, state, mockH, parcel, action)

      expect(controller.setState).toHaveBeenCalledWith(
        mockRequest,
        expect.objectContaining({
          landParcels: expect.not.objectContaining({
            'SD6743-8083': expect.anything()
          })
        })
      )
      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/check-selected-land-actions')
      expect(result).toBe('redirected')
    })
  })

  describe('buildGetViewModel', () => {
    test('should combine parent view model with controller properties', () => {
      const parcel = 'SD6743-8083'
      const pageHeading = 'Test Action'
      const hint = 'hint text is here'

      const result = controller.buildGetViewModel(mockRequest, mockContext, parcel, pageHeading, hint)

      expect(controller.getViewModel).toHaveBeenCalledWith(mockRequest, mockContext)
      expect(result).toEqual({
        pageTitle: 'Remove action',
        serviceUrl: '/test-grant',
        backLink: { text: 'Back', href: '/test-grant/check-selected-land-actions' },
        parcelId: 'SD6743-8083',
        pageHeading,
        hint
      })
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
        pageHeading: `Do you want to remove Assess moorland and produce a written record: CMOR1 from land parcel SD6743 8083?`,
        hint: 'Select yes to remove this action from this land parcel. You can add a different action to the same parcel.'
      })
      expect(result).toBe('rendered view')
    })

    test('should handle removing entire parcel when no action specified', async () => {
      mockRequest.query = { parcelId: 'SD6743-8083' }

      const handler = controller.makeGetRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith('remove-action', {
        pageTitle: 'Remove action',
        serviceUrl: '/test-grant',
        backLink: { text: 'Back', href: '/test-grant/check-selected-land-actions' },
        parcelId: 'SD6743-8083',
        pageHeading: 'Do you want to remove land parcel SD6743 8083 from this application?',
        hint: 'If you remove this land parcel you will also remove all the actions added to this parcel.'
      })
      expect(result).toBe('rendered view')
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
    test('should show validation error when remove not provided and actionDescription exists', async () => {
      mockRequest.payload = {}
      controller.performAuthCheck = vi.fn().mockResolvedValue(false)

      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith('remove-action', {
        pageTitle: 'Remove action',
        serviceUrl: '/test-grant',
        backLink: { text: 'Back', href: '/test-grant/check-selected-land-actions' },
        parcelId: 'SD6743-8083',
        pageHeading:
          'Do you want to remove Assess moorland and produce a written record: CMOR1 from land parcel SD6743 8083?',
        hint: 'Select yes to remove this action from this land parcel. You can add a different action to the same parcel.',
        errors: 'Select yes to remove this action from this land parcel'
      })
      expect(controller.setState).not.toHaveBeenCalled()
      expect(result).toBe('rendered view')
    })

    test('should show validation error for parcel removal when remove not provided and no actionDescription', async () => {
      mockRequest.query = { parcelId: 'SD6743-8083' } // No action in query
      mockRequest.payload = {}

      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith('remove-action', {
        pageTitle: 'Remove action',
        serviceUrl: '/test-grant',
        backLink: { text: 'Back', href: '/test-grant/check-selected-land-actions' },
        parcelId: 'SD6743-8083',
        hint: 'If you remove this land parcel you will also remove all the actions added to this parcel.',
        pageHeading: 'Do you want to remove land parcel SD6743 8083 from this application?',
        errors: 'Select yes to remove this land parcel from this application'
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

    test('should remove entire parcel when no action specified and user confirms', async () => {
      mockRequest.query = { parcelId: 'SD6743-8083' } // No action in query
      mockRequest.payload = { remove: 'true' }

      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(controller.setState).toHaveBeenCalledWith(
        mockRequest,
        expect.objectContaining({
          landParcels: expect.not.objectContaining({
            'SD6743-8083': expect.anything()
          })
        })
      )
      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/check-selected-land-actions')
      expect(result).toBe('redirected')
    })

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
          errors: 'Select yes to remove this action from this land parcel',
          hint: 'Select yes to remove this action from this land parcel. You can add a different action to the same parcel.',
          pageHeading:
            'Do you want to remove Assess moorland and produce a written record: CMOR1 from land parcel SD6743 8083?'
        })
      )
      expect(result).toBe('rendered view')
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

  describe('returnPath configuration', () => {
    const buildConfiguredController = (returnPath) => {
      const pageDef = { path: '/remove-action' }
      const model = {
        def: { metadata: { tasklist: {}, pageConfig: { '/remove-action': { returnPath } } } },
        getSection: vi.fn()
      }
      const configured = new RemoveActionPageController(model, pageDef)
      stubGetHref(configured)
      configured.setState = vi.fn().mockResolvedValue(true)
      configured.proceed = vi.fn().mockReturnValue('redirected')
      configured.performAuthCheck = vi.fn().mockResolvedValue(null)
      configured.getViewModel = vi.fn((request, context) => ({
        pageTitle: 'Remove action',
        serviceUrl: '/test-grant',
        backLink: configured.getBackLink(request, context)
      }))
      return configured
    }

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

    test.each([[''], ['   '], [null], [undefined], [123], [{}]])(
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
  })
})

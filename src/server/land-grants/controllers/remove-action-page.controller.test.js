import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import RemoveActionPageController from './remove-action-page.controller.js'

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
    QuestionPageController.prototype.getViewModel = vi.fn().mockReturnValue({
      pageTitle: 'Remove action'
    })

    controller = new RemoveActionPageController()
    controller.setState = vi.fn().mockResolvedValue(true)
    controller.proceed = vi.fn().mockReturnValue('redirected')

    mockRequest = {
      query: {
        parcelId: 'SD6743-8083',
        action: 'CMOR1'
      },
      payload: {}
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

  test('should have the correct viewName', () => {
    expect(controller.viewName).toBe('remove-action')
  })

  describe('extractParcelInfo', () => {
    test('should extract parcel information correctly', () => {
      const query = { parcelId: 'SD6743-8083', action: 'CMOR1' }
      const result = controller.extractParcelInfo(query)

      expect(result).toEqual({
        action: 'CMOR1',
        parcelKey: 'SD6743-8083',
        parcel: 'SD6743-8083'
      })
    })

    test('should handle empty query gracefully', () => {
      const query = {}
      const result = controller.extractParcelInfo(query)

      expect(result).toEqual({
        action: undefined,
        parcelKey: '-',
        parcel: undefined
      })
    })

    test('should handle missing action in query', () => {
      const query = { parcelId: 'SD6743-8083' }
      const result = controller.extractParcelInfo(query)

      expect(result).toEqual({
        action: undefined,
        parcelKey: 'SD6743-8083',
        parcel: 'SD6743-8083'
      })
    })
  })

  describe('findActionInfo', () => {
    test('should find action info when it exists', () => {
      const result = controller.findActionInfo(mockLandParcels, 'SD6743-8083', 'CMOR1')

      expect(result).toEqual({
        description: 'Assess moorland and produce a written record: CMOR1',
        value: '4.53',
        unit: 'ha'
      })
    })

    test('should return null when parcel does not exist', () => {
      const result = controller.findActionInfo(mockLandParcels, 'nonexistent-parcel', 'CMOR1')

      expect(result).toBeNull()
    })

    test('should return null when action does not exist', () => {
      const result = controller.findActionInfo(mockLandParcels, 'SD6743-8083', 'NONEXISTENT')

      expect(result).toBeNull()
    })

    test('should return null when actionsObj is missing', () => {
      const landParcelsWithoutActions = {
        'SD6743-8083': {}
      }

      const result = controller.findActionInfo(landParcelsWithoutActions, 'SD6743-8083', 'CMOR1')

      expect(result).toBeNull()
    })
  })

  describe('deleteParcelFromState', () => {
    test('should delete entire parcel from state', () => {
      const state = {
        landParcels: JSON.parse(JSON.stringify(mockLandParcels))
      }

      const result = controller.deleteParcelFromState(state, 'SD6743-8083')

      expect(result.landParcels).toEqual({
        'SD6944-0085': {
          actionsObj: {
            CMOR1: {
              description: 'Assess moorland and produce a written record: CMOR1',
              value: '1.0',
              unit: 'ha'
            }
          }
        }
      })
      expect(result.landParcels['SD6743-8083']).toBeUndefined()
    })

    test('should not modify original state object', () => {
      const state = {
        landParcels: JSON.parse(JSON.stringify(mockLandParcels))
      }
      const originalState = JSON.parse(JSON.stringify(state))

      controller.deleteParcelFromState(state, 'SD6743-8083')

      expect(state).toEqual(originalState)
    })

    test('should handle non-existent parcel gracefully', () => {
      const state = {
        landParcels: JSON.parse(JSON.stringify(mockLandParcels))
      }

      const result = controller.deleteParcelFromState(state, 'nonexistent-parcel')

      expect(result.landParcels).toEqual(mockLandParcels)
    })
  })

  describe('deleteActionFromState', () => {
    test('should delete specific action from state', () => {
      const state = {
        landParcels: JSON.parse(JSON.stringify(mockLandParcels))
      }

      const result = controller.deleteActionFromState(state, 'SD6743-8083', 'CMOR1')

      expect(result.landParcels['SD6743-8083'].actionsObj).toEqual({
        UPL1: {
          description: 'Moderate livestock grazing on moorland: UPL1',
          value: '2.5',
          unit: 'ha'
        }
      })
    })

    test('should delete entire parcel when removing last action', () => {
      const state = {
        landParcels: {
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
      }

      const result = controller.deleteActionFromState(state, 'SD6944-0085', 'CMOR1')

      expect(result.landParcels['SD6944-0085']).toBeUndefined()
    })

    test('should not modify original state object', () => {
      const state = {
        landParcels: JSON.parse(JSON.stringify(mockLandParcels))
      }
      const originalState = JSON.parse(JSON.stringify(state))

      controller.deleteActionFromState(state, 'SD6743-8083', 'CMOR1')

      expect(state).toEqual(originalState)
    })

    test('should handle non-existent parcel gracefully', () => {
      const state = {
        landParcels: JSON.parse(JSON.stringify(mockLandParcels))
      }

      const result = controller.deleteActionFromState(state, 'nonexistent-parcel', 'CMOR1')

      expect(result.landParcels).toEqual(mockLandParcels)
    })

    test('should handle non-existent action gracefully', () => {
      const state = {
        landParcels: JSON.parse(JSON.stringify(mockLandParcels))
      }

      const result = controller.deleteActionFromState(state, 'SD6743-8083', 'NONEXISTENT')

      expect(result.landParcels).toEqual(mockLandParcels)
    })
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

      const result = controller.getNextPathAfterRemoval(newState, 'SD6743-8083', 'SD6743-8083')

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

      const result = controller.getNextPathAfterRemoval(newState)

      expect(result).toBe('/check-selected-land-actions')
    })

    test('should return select actions page when removing the last action on the parcel', () => {
      controller.action = 'CMOR1'
      controller.parcel = 'SD6743-8083'
      const newState = { landParcels: {} }

      const result = controller.getNextPathAfterRemoval(newState)

      expect(result).toBe('/select-actions-for-land-parcel?parcelId=SD6743-8083')
    })

    test('should return select land parcel page when removing the last parcel', () => {
      const newState = {
        landParcels: {}
      }

      const result = controller.getNextPathAfterRemoval(newState)

      expect(result).toBe('/select-land-parcel')
    })
  })

  describe('validatePostPayload', () => {
    test('should return error with action description when remove is undefined and actionDescription exists', () => {
      controller.actionDescription = 'Assess moorland and produce a written record: CMOR1'
      controller.parcel = 'SD6743-8083'
      const payload = {}

      const result = controller.validatePostPayload(payload)

      expect(result).toEqual({
        errorMessage:
          'Select yes to remove Assess moorland and produce a written record: CMOR1 from land parcel SD6743-8083'
      })
    })

    test('should return error for parcel removal when remove is undefined and actionDescription is null', () => {
      controller.actionDescription = null
      controller.parcel = 'SD6743-8083'
      const payload = {}

      const result = controller.validatePostPayload(payload)

      expect(result).toEqual({
        errorMessage: 'Select yes to remove land parcel SD6743-8083 from this application'
      })
    })

    test('should return error for parcel removal when remove is undefined and actionDescription is undefined', () => {
      controller.actionDescription = undefined
      controller.parcel = 'SD6743-8083'
      const payload = {}

      const result = controller.validatePostPayload(payload)

      expect(result).toEqual({
        errorMessage: 'Select yes to remove land parcel SD6743-8083 from this application'
      })
    })

    test('should return error for parcel removal when remove is undefined and actionDescription is empty string', () => {
      controller.actionDescription = ''
      controller.parcel = 'SD6743-8083'
      const payload = {}

      const result = controller.validatePostPayload(payload)

      expect(result).toEqual({
        errorMessage: 'Select yes to remove land parcel SD6743-8083 from this application'
      })
    })

    test('should return error when remove is explicitly undefined', () => {
      controller.actionDescription = 'Assess moorland and produce a written record: CMOR1'
      controller.parcel = 'SD6743-8083'
      const payload = { remove: undefined }

      const result = controller.validatePostPayload(payload)

      expect(result).toEqual({
        errorMessage:
          'Select yes to remove Assess moorland and produce a written record: CMOR1 from land parcel SD6743-8083'
      })
    })

    test('should return null when remove is true', () => {
      const payload = { remove: 'true' }

      const result = controller.validatePostPayload(payload)

      expect(result).toBeNull()
    })

    test('should return null when remove is false', () => {
      const payload = { remove: 'false' }

      const result = controller.validatePostPayload(payload)

      expect(result).toBeNull()
    })
  })

  describe('renderPostErrorView', () => {
    test('should render error view with all properties', () => {
      controller.parcel = 'SD6743-8083'
      controller.actionDescription = 'Test Action Description'

      const result = controller.renderPostErrorView(mockH, mockRequest, mockContext, 'Test error message')

      expect(controller.getViewModel).toHaveBeenCalledWith(mockRequest, mockContext)
      expect(mockH.view).toHaveBeenCalledWith('remove-action', {
        pageTitle: 'Remove action',
        parcel: 'SD6743-8083',
        actionDescription: 'Test Action Description',
        errorMessage: 'Test error message'
      })
      expect(result).toBe('rendered view')
    })
  })

  describe('processRemoval', () => {
    test('should remove specific action and redirect to check page when other actions remain', async () => {
      controller.action = 'CMOR1'
      controller.parcel = 'SD6743-8083'

      const state = {
        landParcels: JSON.parse(JSON.stringify(mockLandParcels))
      }

      const result = await controller.processRemoval(mockRequest, state, mockH)

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
      controller.action = 'CMOR1'
      controller.parcel = 'SD6944-0085'

      const state = {
        landParcels: {
          'SD6944-0085': {
            actionsObj: {
              CMOR1: { description: 'Test action' }
            }
          }
        }
      }

      const result = await controller.processRemoval(mockRequest, state, mockH)

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

    test('should remove entire parcel when no action specified', async () => {
      controller.action = null
      controller.parcel = 'SD6743-8083'

      const state = {
        landParcels: JSON.parse(JSON.stringify(mockLandParcels))
      }

      const result = await controller.processRemoval(mockRequest, state, mockH)

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

    test('should remove entire parcel when action is undefined', async () => {
      controller.action = undefined
      controller.parcel = 'SD6743-8083'

      const state = {
        landParcels: JSON.parse(JSON.stringify(mockLandParcels))
      }

      const result = await controller.processRemoval(mockRequest, state, mockH)

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

    test('should remove entire parcel when action is empty string', async () => {
      controller.action = ''
      controller.parcel = 'SD6743-8083'

      const state = {
        landParcels: JSON.parse(JSON.stringify(mockLandParcels))
      }

      const result = await controller.processRemoval(mockRequest, state, mockH)

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
      controller.parcel = 'SD6743-8083'
      controller.actionDescription = 'Test Action'

      const result = controller.buildGetViewModel(mockRequest, mockContext)

      expect(controller.getViewModel).toHaveBeenCalledWith(mockRequest, mockContext)
      expect(result).toEqual({
        pageTitle: 'Remove action',
        parcel: 'SD6743-8083',
        actionDescription: 'Test Action'
      })
    })
  })

  describe('makeGetRouteHandler', () => {
    test('should extract parcel info and render view with action details', async () => {
      const handler = controller.makeGetRouteHandler()

      const result = await handler(mockRequest, mockContext, mockH)

      expect(controller.action).toBe('CMOR1')
      expect(controller.parcel).toBe('SD6743-8083')
      expect(controller.actionDescription).toBe('Assess moorland and produce a written record: CMOR1')
      expect(mockH.view).toHaveBeenCalledWith('remove-action', {
        pageTitle: 'Remove action',
        parcel: 'SD6743-8083',
        actionDescription: 'Assess moorland and produce a written record: CMOR1'
      })
      expect(result).toBe('rendered view')
    })

    test('should handle removing entire parcel when no action specified', async () => {
      mockRequest.query = { parcelId: 'SD6743-8083' }

      const handler = controller.makeGetRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(controller.action).toBeUndefined()
      expect(controller.parcel).toBe('SD6743-8083')
      expect(controller.actionDescription).toBeUndefined()
      expect(mockH.view).toHaveBeenCalledWith('remove-action', {
        pageTitle: 'Remove action',
        parcel: 'SD6743-8083',
        actionDescription: undefined
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

      expect(controller.action).toBe('CMOR1')
      expect(controller.parcel).toBe('nonexistent-parcel')
      expect(controller.actionDescription).toBeUndefined()
      expect(mockH.view).toHaveBeenCalledWith('remove-action', {
        pageTitle: 'Remove action',
        parcel: 'nonexistent-parcel',
        actionDescription: undefined
      })
      expect(result).toBe('rendered view')
    })

    test('should handle empty land parcels state', async () => {
      mockContext.state.landParcels = {}

      const handler = controller.makeGetRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(controller.action).toBe('CMOR1')
      expect(controller.parcel).toBe('SD6743-8083')
      expect(controller.actionDescription).toBeUndefined()
      expect(mockH.view).toHaveBeenCalledWith('remove-action', {
        pageTitle: 'Remove action',
        parcel: 'SD6743-8083',
        actionDescription: undefined
      })
      expect(result).toBe('rendered view')
    })
  })

  describe('makePostRouteHandler', () => {
    beforeEach(() => {
      controller.action = 'CMOR1'
      controller.parcel = 'SD6743-8083'
      controller.actionDescription = 'Assess moorland and produce a written record: CMOR1'
    })

    test('should show validation error when remove not provided and actionDescription exists', async () => {
      mockRequest.payload = {}

      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith('remove-action', {
        pageTitle: 'Remove action',
        parcel: 'SD6743-8083',
        actionDescription: 'Assess moorland and produce a written record: CMOR1',
        errorMessage:
          'Select yes to remove Assess moorland and produce a written record: CMOR1 from land parcel SD6743-8083'
      })
      expect(controller.setState).not.toHaveBeenCalled()
      expect(result).toBe('rendered view')
    })

    test('should show validation error for parcel removal when remove not provided and no actionDescription', async () => {
      controller.actionDescription = undefined
      mockRequest.payload = {}

      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith('remove-action', {
        pageTitle: 'Remove action',
        parcel: 'SD6743-8083',
        errorMessage: 'Select yes to remove land parcel SD6743-8083 from this application'
      })
      expect(controller.setState).not.toHaveBeenCalled()
      expect(result).toBe('rendered view')
    })

    test('should remove action and redirect to check page when other actions remain', async () => {
      mockRequest.payload = { remove: 'true' }

      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

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
      controller.action = undefined // No specific action
      controller.parcel = 'SD6743-8083'
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
      controller.parcel = 'SD6944-0085'
      controller.action = 'CMOR1'
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

      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'remove-action',
        expect.objectContaining({
          errorMessage:
            'Select yes to remove Assess moorland and produce a written record: CMOR1 from land parcel SD6743-8083'
        })
      )
      expect(result).toBe('rendered view')
    })

    test('should handle undefined payload gracefully', async () => {
      mockRequest.payload = undefined

      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'remove-action',
        expect.objectContaining({
          errorMessage:
            'Select yes to remove Assess moorland and produce a written record: CMOR1 from land parcel SD6743-8083'
        })
      )
      expect(result).toBe('rendered view')
    })
  })
})

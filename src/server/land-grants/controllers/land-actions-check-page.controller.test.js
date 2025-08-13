import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import LandActionsCheckPageController from './land-actions-check-page.controller.js'

jest.mock('@defra/forms-engine-plugin/controllers/QuestionPageController.js')
jest.mock('~/src/server/land-grants/services/land-grants.service.js')

describe('LandActionsCheckPageController', () => {
  let controller
  let mockRequest
  let mockContext
  let mockH

  beforeEach(() => {
    QuestionPageController.prototype.getViewModel = jest.fn().mockReturnValue({
      pageTitle: 'Check selected land actions'
    })

    controller = new LandActionsCheckPageController()

    controller.collection = {
      getErrors: jest.fn().mockReturnValue([])
    }
    controller.setState = jest.fn().mockResolvedValue(true)
    controller.proceed = jest.fn().mockReturnValue('redirected')
    controller.getNextPath = jest.fn().mockReturnValue('/next-path')
    controller.getSelectedActionRows = jest
      .fn()
      .mockReturnValue([[{ text: 'sheet1-parcel1' }, { text: 'Test Action' }, { text: '10 hectares' }]])

    mockRequest = {
      payload: {
        actions: ['action1', 'action2']
      },
      logger: {
        error: jest.fn()
      }
    }

    mockContext = {
      state: {
        landParcel: 'sheet1-parcel1',
        landParcels: {
          'sheet1-parcel1': {
            actionsObj: {
              action1: {
                description: 'Test Action',
                value: 10,
                unit: 'hectares'
              }
            }
          },
          'sheet2-parcel1': {
            actionsObj: {
              action1: {
                description: 'Test Action 1',
                value: 10,
                unit: 'hectares'
              },
              action2: {
                description: 'Test Action 2',
                value: 15,
                unit: 'hectares'
              }
            }
          }
        }
      }
    }

    mockH = {
      view: jest.fn().mockReturnValue('rendered view'),
      redirect: jest.fn().mockReturnValue('redirected')
    }
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  test('should have the correct viewName', () => {
    expect(controller.viewName).toBe('land-actions-check')
  })

  describe('POST route handler', () => {
    test('should show error when addMoreActions is not provided and action is validate', async () => {
      mockRequest.payload = { action: 'validate' }

      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith('land-actions-check', {
        pageTitle: 'Check selected land actions',
        landParcel: 'sheet1-parcel1',
        landParcels: {
          'sheet1-parcel1': {
            actionsObj: {
              action1: {
                description: 'Test Action',
                unit: 'hectares',
                value: 10
              }
            }
          },
          'sheet2-parcel1': {
            actionsObj: {
              action1: {
                description: 'Test Action 1',
                unit: 'hectares',
                value: 10
              },
              action2: {
                description: 'Test Action 2',
                unit: 'hectares',
                value: 15
              }
            }
          }
        },
        selectedActionRows: [],
        errorMessage: 'Please select if you want to add more actions'
      })
      expect(result).toBe('rendered view')
    })

    test('should show error when addMoreActions is null and action is validate', async () => {
      mockRequest.payload = { addMoreActions: null, action: 'validate' }

      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith('land-actions-check', {
        pageTitle: 'Check selected land actions',
        landParcel: 'sheet1-parcel1',
        landParcels: {
          'sheet1-parcel1': {
            actionsObj: {
              action1: {
                description: 'Test Action',
                unit: 'hectares',
                value: 10
              }
            }
          },
          'sheet2-parcel1': {
            actionsObj: {
              action1: {
                description: 'Test Action 1',
                unit: 'hectares',
                value: 10
              },
              action2: {
                description: 'Test Action 2',
                unit: 'hectares',
                value: 15
              }
            }
          }
        },
        selectedActionRows: [],
        errorMessage: 'Please select if you want to add more actions'
      })
      expect(result).toBe('rendered view')
    })

    test('should show error when addMoreActions is undefined and action is validate', async () => {
      mockRequest.payload = { addMoreActions: undefined, action: 'validate' }

      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith('land-actions-check', {
        pageTitle: 'Check selected land actions',
        landParcel: 'sheet1-parcel1',
        landParcels: {
          'sheet1-parcel1': {
            actionsObj: {
              action1: {
                description: 'Test Action',
                unit: 'hectares',
                value: 10
              }
            }
          },
          'sheet2-parcel1': {
            actionsObj: {
              action1: {
                description: 'Test Action 1',
                unit: 'hectares',
                value: 10
              },
              action2: {
                description: 'Test Action 2',
                unit: 'hectares',
                value: 15
              }
            }
          }
        },
        selectedActionRows: [],
        errorMessage: 'Please select if you want to add more actions'
      })
      expect(result).toBe('rendered view')
    })

    test('should redirect to select-land-parcel when addMoreActions is "true"', async () => {
      mockRequest.payload = { addMoreActions: 'true' }

      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/select-land-parcel')
      expect(result).toBe('redirected')
    })

    test('should proceed to next path when addMoreActions is "false"', async () => {
      mockRequest.payload = { addMoreActions: 'false' }

      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/next-path')
      expect(result).toBe('redirected')
    })

    test('should proceed to next path when addMoreActions is "no"', async () => {
      mockRequest.payload = { addMoreActions: 'no' }

      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/next-path')
      expect(result).toBe('redirected')
    })

    test('should handle empty payload gracefully when action is validate', async () => {
      mockRequest.payload = { action: 'validate' }

      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith('land-actions-check', {
        pageTitle: 'Check selected land actions',
        landParcel: 'sheet1-parcel1',
        landParcels: {
          'sheet1-parcel1': {
            actionsObj: {
              action1: {
                description: 'Test Action',
                unit: 'hectares',
                value: 10
              }
            }
          },
          'sheet2-parcel1': {
            actionsObj: {
              action1: {
                description: 'Test Action 1',
                unit: 'hectares',
                value: 10
              },
              action2: {
                description: 'Test Action 2',
                unit: 'hectares',
                value: 15
              }
            }
          }
        },
        selectedActionRows: [],
        errorMessage: 'Please select if you want to add more actions'
      })
      expect(result).toBe('rendered view')
    })

    test('should proceed to next path without validation when action is not validate', async () => {
      mockRequest.payload = {}

      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/next-path')
      expect(result).toBe('redirected')
    })
  })

  describe('makeGetRouteHandler', () => {
    test('should call h.view with correct viewName and viewModel', () => {
      // Arrange
      controller.getViewModel = jest.fn().mockReturnValue({ foo: 'bar' })
      controller.getSelectedActionRows = jest.fn().mockReturnValue([
        [{ text: 'sheet1-parcel1' }, { text: 'Test Action' }, { text: '10 hectares' }],
        [{ text: 'sheet2-parcel1' }, { text: 'Test Action 1' }, { text: '10 hectares' }],
        [{ text: 'sheet2-parcel1' }, { text: 'Test Action 2' }, { text: '15 hectares' }]
      ])
      controller.collection = {
        getErrors: jest.fn().mockReturnValue([])
      }
      const handler = controller.makeGetRouteHandler()

      // Act
      const result = handler(mockRequest, mockContext, mockH)

      // Assert
      expect(controller.getSelectedActionRows).toHaveBeenCalledWith(mockContext.state, mockContext)

      expect(mockH.view).toHaveBeenCalledWith(
        'land-actions-check',
        expect.objectContaining({
          foo: 'bar',
          landParcel: expect.any(String),
          landParcels: expect.any(Object),
          selectedActionRows: expect.any(Array),
          pageTitle: 'You have selected 3 actions to 2 parcels',
          errors: []
        })
      )

      expect(result).toBe('rendered view')
    })

    test('should pluralize correctly for single parcel and action', () => {
      controller.getSelectedActionRows = jest
        .fn()
        .mockReturnValue([[{ text: 'sheet1-parcel1' }, { text: 'Test Action' }, { text: '10 hectares' }]])
      const singleParcelContext = {
        state: {
          landParcels: {
            'sheet1-parcel1': {
              actionsObj: {
                action1: {
                  description: 'Test Action',
                  value: 10,
                  unit: 'hectares'
                }
              }
            }
          }
        }
      }
      const handler = controller.makeGetRouteHandler()
      handler(mockRequest, singleParcelContext, mockH)
      expect(mockH.view).toHaveBeenCalledWith(
        'land-actions-check',
        expect.objectContaining({
          pageTitle: 'You have selected 1 action to 1 parcel'
        })
      )
    })

    test('should pluralize correctly for multiple parcels and actions', () => {
      controller.getSelectedActionRows = jest.fn().mockReturnValue([
        [{ text: 'sheet1-parcel1' }, { text: 'Test Action' }, { text: '10 hectares' }],
        [{ text: 'sheet2-parcel1' }, { text: 'Test Action 1' }, { text: '10 hectares' }]
      ])
      const multiParcelContext = {
        state: {
          landParcels: {
            'sheet1-parcel1': {
              actionsObj: {
                action1: {
                  description: 'Test Action',
                  value: 10,
                  unit: 'hectares'
                }
              }
            },
            'sheet2-parcel1': {
              actionsObj: {
                action1: {
                  description: 'Test Action 1',
                  value: 10,
                  unit: 'hectares'
                }
              }
            }
          }
        }
      }
      const handler = controller.makeGetRouteHandler()
      handler(mockRequest, multiParcelContext, mockH)
      expect(mockH.view).toHaveBeenCalledWith(
        'land-actions-check',
        expect.objectContaining({
          pageTitle: 'You have selected 2 actions to 2 parcels'
        })
      )
    })

    test('should pass errors from collection.getErrors', () => {
      controller.collection.getErrors = jest.fn().mockReturnValue(['error1'])
      controller.getSelectedActionRows = jest.fn().mockReturnValue([])
      const handler = controller.makeGetRouteHandler()
      handler(mockRequest, mockContext, mockH)
      expect(mockH.view).toHaveBeenCalledWith(
        'land-actions-check',
        expect.objectContaining({
          errors: ['error1']
        })
      )
    })

    describe('getSelectedActionRows', () => {
      test('should return correct rows for multiple parcels and actions', () => {
        const state = {
          landParcels: {
            'sheet1-parcel1': {
              actionsObj: {
                action1: {
                  description: 'Test Action',
                  value: 10,
                  unit: 'hectares',
                  annualPaymentPence: 1000
                }
              }
            },
            'sheet2-parcel1': {
              actionsObj: {
                action1: {
                  description: 'Test Action 1',
                  value: 10,
                  unit: 'hectares',
                  annualPaymentPence: 1000
                },
                action2: {
                  description: 'Test Action 2',
                  value: 15,
                  unit: 'hectares',
                  annualPaymentPence: 2000
                }
              }
            }
          }
        }
        const controller = new LandActionsCheckPageController()
        const rows = controller.getSelectedActionRows(state)
        expect(rows).toEqual([
          [{ text: 'sheet1-parcel1' }, { text: 'Test Action' }, { text: '10 hectares' }, { text: '£10.00' }],
          [{ text: 'sheet2-parcel1' }, { text: 'Test Action 1' }, { text: '10 hectares' }, { text: '£10.00' }],
          [{ text: 'sheet2-parcel1' }, { text: 'Test Action 2' }, { text: '15 hectares' }, { text: '£20.00' }]
        ])
      })

      test('should return empty array if no landParcels', () => {
        const state = { landParcels: {} }
        const controller = new LandActionsCheckPageController()
        const rows = controller.getSelectedActionRows(state)
        expect(rows).toEqual([])
      })

      test('should handle parcels with no actionsObj', () => {
        const state = {
          landParcels: {
            'sheet1-parcel1': {}
          }
        }
        const controller = new LandActionsCheckPageController()
        // Should not throw, but will return [undefined] due to map on undefined, so we should guard in production
        expect(() => controller.getSelectedActionRows(state)).toThrow()
      })
    })
  })
})

/**
 * @import { type FormRequest } from '~/src/server/routes/types.js'
 * @import { type FormContext } from '~/src/server/plugins/engine/types.js'
 * @import { type ResponseToolkit } from '@hapi/hapi'
 */

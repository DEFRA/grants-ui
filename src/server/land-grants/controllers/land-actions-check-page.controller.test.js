import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { vi } from 'vitest'
import { mockRequestLogger } from '~/src/__mocks__/logger-mocks.js'
import { sbiStore } from '~/src/server/sbi/state.js'
import { calculateGrantPayment } from '../services/land-grants.service.js'
import LandActionsCheckPageController from './land-actions-check-page.controller.js'

vi.mock('~/src/server/land-grants/services/land-grants.service.js', () => ({
  actionGroups: [{ actions: ['CMOR1'] }, { actions: ['UPL1', 'UPL2', 'UPL3'] }],
  calculateGrantPayment: vi.fn(),
  stringifyParcel: ({ parcelId, sheetId }) => `${sheetId}-${parcelId}`
}))

vi.mock('~/src/server/sbi/state.js', () => ({
  sbiStore: {
    get: vi.fn()
  }
}))

describe('LandActionsCheckPageController', () => {
  let controller
  let mockRequest
  let mockContext
  let mockH

  const mockPaymentResponse = {
    payment: {
      annualTotalPence: 32006,
      parcelItems: {
        1: {
          code: 'CMOR1',
          description: 'Assess moorland and produce a written record: CMOR1',
          quantity: 4.53,
          annualPaymentPence: 4806,
          sheetId: 'SD6743',
          parcelId: '8083'
        }
      },
      agreementLevelItems: {
        1: {
          code: 'MAN1',
          description: 'Management payment',
          annualPaymentPence: 27200
        }
      }
    }
  }

  beforeEach(() => {
    QuestionPageController.prototype.getViewModel = vi.fn().mockReturnValue({
      pageTitle: 'Check selected land actions'
    })

    controller = new LandActionsCheckPageController()
    controller.collection = {
      getErrors: vi.fn().mockReturnValue([])
    }
    controller.setState = vi.fn().mockResolvedValue(true)
    controller.proceed = vi.fn().mockReturnValue('redirected')
    controller.getNextPath = vi.fn().mockReturnValue('/next-path')
    controller.getSelectedActionRows = vi
      .fn()
      .mockReturnValue([[{ text: 'sheet1-parcel1' }, { text: 'Test Action' }, { text: '10 hectares' }]])

    // actionGroups.mockReturnValue([{ actions: ['CMOR1'] }, { actions: ['UPL1', 'UPL2', 'UPL3'] }])
    calculateGrantPayment.mockResolvedValue(mockPaymentResponse)
    sbiStore.get = vi.fn().mockReturnValue('123456789')

    mockRequest = {
      payload: {},
      logger: mockRequestLogger()
    }
    mockContext = {
      state: {
        landParcels: {
          'sheet1-parcel1': {
            actionsObj: { ACTION1: { value: '10.5' } }
          }
        }
      }
    }
    mockH = {
      view: vi.fn().mockReturnValue('rendered view'),
      redirect: vi.fn().mockReturnValue('redirected')
    }
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Payment Calculation', () => {
    test('should transform state data correctly for payment calculation', async () => {
      const testState = {
        landParcels: {
          'SD6743-8083': {
            actionsObj: {
              CMOR1: { value: '4.53' },
              ACTION2: { value: '2.1' }
            }
          },
          'SD6944-0085': {
            actionsObj: {
              CMOR1: { value: '1.0' }
            }
          }
        }
      }

      await controller.calculatePaymentInformationFromState(testState)

      expect(calculateGrantPayment).toHaveBeenCalledWith({
        landActions: [
          {
            sbi: '123456789',
            sheetId: 'SD6743',
            parcelId: '8083',
            actions: [
              { code: 'CMOR1', quantity: 4.53 },
              { code: 'ACTION2', quantity: 2.1 }
            ]
          },
          {
            sbi: '123456789',
            sheetId: 'SD6944',
            parcelId: '0085',
            actions: [{ code: 'CMOR1', quantity: 1.0 }]
          }
        ]
      })
    })

    test('should handle empty state gracefully', async () => {
      const result = await controller.calculatePaymentInformationFromState({})

      expect(calculateGrantPayment).toHaveBeenCalledWith({ landActions: [] })
      expect(result).toEqual(mockPaymentResponse)
    })

    test('should skip parcels without actions', async () => {
      const testState = {
        landParcels: {
          'sheet1-parcel1': { actionsObj: { ACTION1: { value: '10' } } },
          'sheet2-parcel2': {}, // No actions
          'sheet3-parcel3': { actionsObj: {} } // Empty actions
        }
      }

      await controller.calculatePaymentInformationFromState(testState)

      expect(calculateGrantPayment).toHaveBeenCalledWith({
        landActions: [
          {
            sbi: '123456789',
            sheetId: 'sheet1',
            parcelId: 'parcel1',
            actions: [{ code: 'ACTION1', quantity: 10 }]
          }
        ]
      })
    })
  })

  describe('GET Handler - Payment Display', () => {
    test('should fetch payment data and display summary', async () => {
      const handler = controller.makeGetRouteHandler()

      await handler(mockRequest, mockContext, mockH)

      expect(calculateGrantPayment).toHaveBeenCalled()
      expect(controller.setState).toHaveBeenCalledWith(
        mockRequest,
        expect.objectContaining({
          payment: mockPaymentResponse.payment,
          draftApplicationAnnualTotalPence: 32006
        })
      )
      expect(mockH.view).toHaveBeenCalledWith(
        'land-actions-check',
        expect.objectContaining({
          totalYearlyPayment: '£320.06'
        })
      )
    })

    test('should handle zero payment correctly', async () => {
      calculateGrantPayment.mockResolvedValue({
        payment: { annualTotalPence: 0, parcelItems: {}, agreementLevelItems: {} }
      })

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'land-actions-check',
        expect.objectContaining({
          totalYearlyPayment: '£0.00'
        })
      )
    })
  })

  describe('POST Handler - Form Validation', () => {
    test('should show validation error when user must choose but does not', async () => {
      mockRequest.payload = { action: 'validate' } // No addMoreActions provided

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'land-actions-check',
        expect.objectContaining({
          errorMessage: 'Please select if you want to add more actions'
        })
      )
      expect(controller.proceed).not.toHaveBeenCalled()
    })

    test('should handle missing payment data gracefully in validation error', async () => {
      mockContext.state = { landParcels: {} } // No payment data
      mockRequest.payload = { action: 'validate' }

      const handler = controller.makePostRouteHandler()

      expect(async () => {
        await handler(mockRequest, mockContext, mockH)
      }).not.toThrow()
    })

    test('should redirect to add more actions when user chooses yes', async () => {
      mockRequest.payload = { addMoreActions: 'true' }

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/select-land-parcel')
    })

    test('should continue to next step when user chooses no', async () => {
      mockRequest.payload = { addMoreActions: 'false' }

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/next-path')
    })

    test('should proceed normally when no validation required', async () => {
      mockRequest.payload = {} // No action: 'validate'

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/next-path')
      expect(mockH.view).not.toHaveBeenCalled()
    })
  })

  describe('Data Formatting', () => {
    test('should format currency correctly', () => {
      expect(controller.getPrice(32006)).toBe('£320.06')
      expect(controller.getPrice(0)).toBe('£0.00')
      expect(controller.getPrice(100)).toBe('£1.00')
    })

    test('should group parcel items by parcel ID', () => {
      const paymentData = {
        parcelItems: {
          1: {
            code: 'CMOR1',
            description: 'Land Action 1',
            quantity: 5,
            annualPaymentPence: 1000,
            sheetId: 'SD01',
            parcelId: '001'
          },
          2: {
            code: 'UPL1',
            description: 'Land Action 2',
            quantity: 3,
            annualPaymentPence: 500,
            sheetId: 'SD01',
            parcelId: '001'
          },
          3: {
            code: 'UPL2',
            description: 'Land Action 3',
            quantity: 2,
            annualPaymentPence: 200,
            sheetId: 'SD02',
            parcelId: '002'
          }
        }
      }

      const result = controller.getParcelItems(paymentData)

      expect(result[0].cardTitle).toBe('Land parcel SD01 001')
      expect(result).toHaveLength(2) // Two different parcels
      expect(result[0].parcelId).toBe('SD01 001')
      expect(result[0].items).toHaveLength(2) // Two actions for first parcel
      expect(result[1].cardTitle).toBe('Land parcel SD02 002')
      expect(result[1].parcelId).toBe('SD02 002')
      expect(result[1].items).toHaveLength(1) // One action for second parcel
    })

    describe('"Add another action" links', () => {
      test('should display Add another action for land parcels with only one action', () => {
        const paymentData = {
          parcelItems: {
            1: {
              code: 'CMOR1',
              description: 'CMOR1',
              quantity: 5,
              annualPaymentPence: 1000,
              sheetId: 'SD01',
              parcelId: '001'
            }
          }
        }

        const result = controller.getParcelItems(paymentData)

        expect(result[0].footerActions).toEqual({
          text: 'Add another action',
          href: 'select-actions-for-land-parcel?parcelId=SD01-001',
          hiddenTextValue: 'SD01 001'
        })
      })

      test('should display Add another action for land parcels with one UPl action', () => {
        const paymentData = {
          parcelItems: {
            1: {
              code: 'UPL1',
              description: 'UPL1',
              quantity: 5,
              annualPaymentPence: 1000,
              sheetId: 'SD01',
              parcelId: '001'
            }
          }
        }

        const result = controller.getParcelItems(paymentData)

        expect(result[0].footerActions).toEqual({
          text: 'Add another action',
          href: 'select-actions-for-land-parcel?parcelId=SD01-001',
          hiddenTextValue: 'SD01 001'
        })
      })

      test('should hide Add another action for land parcels when CMOR1 and any UPL actions are present', () => {
        const paymentData = {
          parcelItems: {
            1: {
              code: 'CMOR1',
              description: 'CMOR1',
              quantity: 5,
              annualPaymentPence: 1000,
              sheetId: 'SD01',
              parcelId: '001'
            },
            2: {
              code: 'UPL1',
              description: 'UPL1',
              quantity: 3,
              annualPaymentPence: 500,
              sheetId: 'SD01',
              parcelId: '001'
            }
          }
        }

        const result = controller.getParcelItems(paymentData)

        expect(result[0].footerActions).toEqual({})
      })
    })

    test('should format additional yearly payments', () => {
      const paymentData = {
        agreementLevelItems: {
          1: { description: 'Management fee', annualPaymentPence: 5000, code: 'MAN1' }
        }
      }

      const result = controller.getAdditionalYearlyPayments(paymentData)

      expect(result[0].items[0][0].text).toBe('One-off payment per agreement per year for Management fee: MAN1')
      expect(result[0].items[0][1].text).toBe('£50.00')
    })
  })

  describe('makeGetRouteHandler', () => {
    test('should call h.view with correct viewName and viewModel', async () => {
      // Arrange
      controller.getViewModel = vi.fn().mockReturnValue({ foo: 'bar' })
      controller.collection = {
        getErrors: vi.fn().mockReturnValue([])
      }
      const handler = controller.makeGetRouteHandler()

      // Act
      const result = await handler(mockRequest, mockContext, mockH)

      // Assert
      expect(mockH.view).toHaveBeenCalledWith(
        'land-actions-check',
        expect.objectContaining({
          foo: 'bar',
          landParcels: expect.any(Object),
          parcelItems: expect.any(Array),
          additionalYearlyPayments: expect.any(Array),
          totalYearlyPayment: expect.any(String),
          errors: []
        })
      )

      expect(result).toBe('rendered view')
    })

    test('should pluralize correctly for single parcel and action', async () => {
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
      await handler(mockRequest, singleParcelContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'land-actions-check',
        expect.objectContaining({
          landParcels: expect.any(Object),
          parcelItems: expect.any(Array),
          additionalYearlyPayments: expect.any(Array),
          totalYearlyPayment: expect.any(String)
        })
      )
    })

    test('should pluralize correctly for multiple parcels and actions', async () => {
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
      await handler(mockRequest, multiParcelContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'land-actions-check',
        expect.objectContaining({
          landParcels: expect.any(Object),
          parcelItems: expect.any(Array),
          additionalYearlyPayments: expect.any(Array),
          totalYearlyPayment: expect.any(String)
        })
      )
    })

    test('should pass errors from collection.getErrors', async () => {
      controller.collection.getErrors = vi.fn().mockReturnValue(['error1'])
      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)
      expect(mockH.view).toHaveBeenCalledWith(
        'land-actions-check',
        expect.objectContaining({
          errors: ['error1']
        })
      )
    })
  })
  describe('Link Visibility Logic', () => {
    test('should show Change link for UPL actions (multiple action group)', () => {
      const paymentData = {
        parcelItems: {
          1: {
            code: 'UPL1',
            description: 'Action description',
            quantity: 5,
            annualPaymentPence: 1000,
            sheetId: 'SD01',
            parcelId: '001'
          }
        }
      }

      const result = controller.getParcelItems(paymentData)
      const linksHtml = result[0].items[0][3].html

      expect(linksHtml).toContain("href='select-actions-for-land-parcel?parcelId=SD01-001&action=UPL1'>Change</a>")
      expect(linksHtml).toContain("href='confirm-remove-action?parcel=SD01-001&action=UPL1'>Remove</a>")
      expect(linksHtml).toContain('land action UPL1 for parcel SD01 001')
      expect(linksHtml).toContain('land action UPL1 for parcel SD01 001')
    })

    test('should hide Change link for CMOR1 actions (single action group)', () => {
      const paymentData = {
        parcelItems: {
          1: {
            code: 'CMOR1',
            description: 'CMOR1: Assess moorland',
            quantity: 3,
            annualPaymentPence: 800,
            sheetId: 'SD02',
            parcelId: '002'
          }
        }
      }

      const result = controller.getParcelItems(paymentData)
      const linksHtml = result[0].items[0][3].html

      expect(linksHtml).not.toContain('Change</a>')
      expect(linksHtml).toContain("href='confirm-remove-action?parcel=SD02-002&action=CMOR1'>Remove</a>")
      expect(linksHtml).toContain('land action CMOR1 for parcel SD02 002')
    })

    test('should show different links for mixed actions on same parcel', () => {
      const paymentData = {
        parcelItems: {
          1: {
            code: 'CMOR1',
            description: 'Assess moorland',
            quantity: 2,
            annualPaymentPence: 600,
            sheetId: 'SD03',
            parcelId: '003'
          },
          2: {
            code: 'UPL2',
            description: 'Upland action',
            quantity: 4,
            annualPaymentPence: 1200,
            sheetId: 'SD03',
            parcelId: '003'
          }
        }
      }

      const result = controller.getParcelItems(paymentData)

      expect(result).toHaveLength(1)
      expect(result[0].items).toHaveLength(2)

      const cmor1LinksHtml = result[0].items[0][3].html
      const upl2LinksHtml = result[0].items[1][3].html

      expect(cmor1LinksHtml).not.toContain('Change</a>')
      expect(cmor1LinksHtml).toContain('Remove</a>')

      expect(upl2LinksHtml).toContain('Change</a>')
      expect(upl2LinksHtml).toContain('Remove</a>')
    })
  })

  describe('Form Validation Edge Cases', () => {
    test('should handle unexpected payload values gracefully', async () => {
      mockRequest.payload = {
        action: 'validate',
        addMoreActions: null,
        unexpectedField: 'value'
      }

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'land-actions-check',
        expect.objectContaining({
          errorMessage: 'Please select if you want to add more actions'
        })
      )
    })

    test('should handle addMoreActions with unexpected values', async () => {
      mockRequest.payload = { addMoreActions: 'maybe' }

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/next-path')
    })

    test('should handle completely empty payload', async () => {
      mockRequest.payload = undefined

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/next-path')
    })
  })
})

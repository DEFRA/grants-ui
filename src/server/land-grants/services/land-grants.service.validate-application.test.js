// @ts-nocheck
import { vi } from 'vitest'
import { validateApplication as validateApplicationService } from '~/src/server/land-grants/services/land-grants.service.js'
import { validate } from '~/src/server/land-grants/services/land-grants.client.js'
import { mockApiEndpoint, mockUserContext, withUserContext } from './land-grants.service.test-helpers.js'

const validateApplication = withUserContext(validateApplicationService)

vi.mock('~/src/server/land-grants/services/land-grants.client.js', async (importOriginal) => {
  const { landGrantsClientMockOverrides } = await import('./land-grants.service.test-helpers.js')
  return { ...(await importOriginal()), ...landGrantsClientMockOverrides }
})

vi.mock('~/src/config/config.js', async () => {
  const { mockConfigWithState } = await import('~/src/__mocks__/config-mocks.js')
  const { landGrantsApiConfigDefaults } = await import('./land-grants.service.test-helpers.js')
  return mockConfigWithState(landGrantsApiConfigDefaults)
})

describe('land-grants service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('validateApplication', () => {
    const validationInput = {
      applicationId: '123456',
      crn: '123456',
      state: {
        landParcels: { 'SHEET1-PARCEL1': { actionsObj: { CMOR1: { value: 10 } } } }
      }
    }

    it('should call the validation application API', async () => {
      const mockApiResponse = { id: '123456' }
      validate.mockResolvedValueOnce(mockApiResponse)

      const result = await validateApplication(validationInput)

      expect(validate).toHaveBeenCalledWith(
        {
          applicationId: '123456',
          requester: 'grants-ui',
          applicantCrn: '123456',
          landActions: [{ sheetId: 'SHEET1', parcelId: 'PARCEL1', actions: [{ code: 'CMOR1', quantity: 10 }] }]
        },
        mockApiEndpoint,
        mockUserContext
      )
      expect(result).toEqual(mockApiResponse)
    })

    describe('building errorMessages from response', () => {
      it('should build errorMessages from actions with failed rules', async () => {
        validate.mockResolvedValueOnce({
          valid: false,
          actions: [
            {
              actionCode: 'CMOR1',
              sheetId: 'SD6843',
              parcelId: '7039',
              hasPassed: false,
              rules: [
                {
                  name: 'parcel-has-intersection-with-data-layer-moorland',
                  passed: false,
                  reason: 'This parcel is not majority on the moorland',
                  description: 'Is this parcel on the moorland?'
                },
                {
                  name: 'applied-for-total-available-area',
                  passed: false,
                  reason: 'There is not sufficient available area (1.3308 ha) for the applied figure (12.4034 ha)',
                  description: 'Has the total available area been applied for?'
                }
              ]
            }
          ]
        })

        const result = await validateApplication(validationInput)

        expect(result.errorMessages).toEqual([
          {
            code: 'CMOR1',
            description: 'This parcel is not majority on the moorland',
            sheetId: 'SD6843',
            parcelId: '7039',
            passed: false
          },
          {
            code: 'CMOR1',
            description: 'There is not sufficient available area (1.3308 ha) for the applied figure (12.4034 ha)',
            sheetId: 'SD6843',
            parcelId: '7039',
            passed: false
          }
        ])
      })

      it('should skip actions that have passed', async () => {
        validate.mockResolvedValueOnce({
          valid: false,
          actions: [
            {
              actionCode: 'CMOR1',
              sheetId: 'SD7861',
              parcelId: '5677',
              hasPassed: true,
              rules: [{ name: 'rule1', passed: true, reason: 'Passed', description: 'Check' }]
            },
            {
              actionCode: 'UPL1',
              sheetId: 'SD6843',
              parcelId: '7039',
              hasPassed: false,
              rules: [{ name: 'rule2', passed: false, reason: 'Not sufficient area', description: 'Area check' }]
            }
          ]
        })

        const result = await validateApplication(validationInput)

        expect(result.errorMessages).toEqual([
          {
            code: 'UPL1',
            description: 'Not sufficient area',
            sheetId: 'SD6843',
            parcelId: '7039',
            passed: false
          }
        ])
      })

      it('should skip passed rules within a failed action', async () => {
        validate.mockResolvedValueOnce({
          valid: false,
          actions: [
            {
              actionCode: 'CMOR1',
              sheetId: 'SD6843',
              parcelId: '7039',
              hasPassed: false,
              rules: [
                { name: 'rule1', passed: true, reason: 'Passed check', description: 'Check 1' },
                { name: 'rule2', passed: false, reason: 'Failed check', description: 'Check 2' }
              ]
            }
          ]
        })

        const result = await validateApplication(validationInput)

        expect(result.errorMessages).toEqual([
          {
            code: 'CMOR1',
            description: 'Failed check',
            sheetId: 'SD6843',
            parcelId: '7039',
            passed: false
          }
        ])
      })

      it('should return empty errorMessages when all actions pass', async () => {
        validate.mockResolvedValueOnce({
          valid: true,
          actions: [
            {
              actionCode: 'CMOR1',
              sheetId: 'SD7861',
              parcelId: '5677',
              hasPassed: true,
              rules: [{ name: 'rule1', passed: true, reason: 'Passed', description: 'Check' }]
            }
          ]
        })

        const result = await validateApplication(validationInput)

        expect(result.errorMessages).toEqual([])
      })

      it('should handle response with empty actions array', async () => {
        validate.mockResolvedValueOnce({
          valid: false,
          actions: []
        })

        const result = await validateApplication(validationInput)

        expect(result.errorMessages).toEqual([])
      })
    })

    it('should return empty errorMessages when response has no actions', async () => {
      const mockApiResponse = {
        valid: false
      }
      validate.mockResolvedValueOnce(mockApiResponse)

      const result = await validateApplication(validationInput)

      expect(result.errorMessages).toEqual([])
    })
  })
})

import { transformStateObjectToGasApplication } from '~/src/server/common/helpers/grant-application-service/state-to-gas-payload-mapper.js'
import { validateGasPayload } from '~/src/server/common/schemas/gas-payload.schema.js'

jest.mock('crypto', () => ({ randomUUID: () => 'CLIENT-REF-456' }))

const mockDate = new Date('2025-04-22T12:00:00Z')
const originalDate = global.Date

beforeAll(() => {
  global.Date = class extends Date {
    constructor() {
      return mockDate
    }

    static now() {
      return mockDate.getTime()
    }

    toISOString() {
      return mockDate.toISOString()
    }
  }
})

afterAll(() => {
  global.Date = originalDate
})

describe('transformStateObjectToGasApplication', () => {
  it('should transform a state object with basic properties', () => {
    const identifiers = {
      sbi: '12345678',
      frn: 'FRN123456',
      crn: 'CRN789012',
      defraId: 'DEFRA-ID-123',
      clientRef: 'CLIENT-REF-456'
    }
    const state = {}

    const mockAnswersTransformer = jest.fn().mockReturnValue({
      scheme: 'Test Scheme',
      year: 2025
    })

    const result = transformStateObjectToGasApplication(
      identifiers,
      state,
      mockAnswersTransformer
    )

    expect(result).toEqual({
      metadata: {
        sbi: '12345678',
        frn: 'FRN123456',
        crn: 'CRN789012',
        defraId: 'DEFRA-ID-123',
        clientRef: 'CLIENT-REF-456',
        submittedAt: mockDate.toISOString()
      },
      answers: {
        scheme: 'Test Scheme',
        year: 2025
      }
    })

    expect(mockAnswersTransformer).toHaveBeenCalledWith(state)
  })

  it('should handle missing optional properties', () => {
    const identifiers = {
      sbi: '12345678'
    }

    const state = {}

    const mockAnswersTransformer = jest.fn().mockReturnValue({
      scheme: 'Test Scheme'
    })

    const result = transformStateObjectToGasApplication(
      identifiers,
      state,
      mockAnswersTransformer
    )

    expect(result).toEqual({
      metadata: {
        sbi: '12345678',
        frn: undefined,
        crn: undefined,
        defraId: undefined,
        clientRef: 'CLIENT-REF-456',
        submittedAt: mockDate.toISOString()
      },
      answers: {
        scheme: 'Test Scheme'
      }
    })
  })

  it('should transform a state with action applications', () => {
    const identifiers = {
      sbi: '12345678',
      frn: 'FRN123456',
      crn: 'CRN789012',
      defraId: 'DEFRA-ID-123',
      clientRef: 'CLIENT-REF-456'
    }

    const state = {
      actionApplications: [
        {
          parcelId: 'PARCEL-001',
          sheetId: 'SHEET-001',
          code: 'ACTION-001',
          appliedFor: {
            unit: 'ha',
            quantity: 25.5
          }
        },
        {
          parcelId: 'PARCEL-002',
          sheetId: 'SHEET-002',
          code: 'ACTION-002',
          appliedFor: {
            unit: 'm2',
            quantity: 10000
          }
        }
      ]
    }

    const mockAnswersTransformer = jest.fn().mockImplementation((state) => ({
      scheme: 'Land Grants',
      year: 2025,
      hasCheckedLandIsUpToDate: true,
      actionApplications: state.actionApplications
    }))

    const result = transformStateObjectToGasApplication(
      identifiers,
      state,
      mockAnswersTransformer
    )

    expect(result).toEqual({
      metadata: {
        sbi: '12345678',
        frn: 'FRN123456',
        crn: 'CRN789012',
        defraId: 'DEFRA-ID-123',
        clientRef: 'CLIENT-REF-456',
        submittedAt: mockDate.toISOString()
      },
      answers: {
        scheme: 'Land Grants',
        year: 2025,
        hasCheckedLandIsUpToDate: true,
        actionApplications: [
          {
            parcelId: 'PARCEL-001',
            sheetId: 'SHEET-001',
            code: 'ACTION-001',
            appliedFor: {
              unit: 'ha',
              quantity: 25.5
            }
          },
          {
            parcelId: 'PARCEL-002',
            sheetId: 'SHEET-002',
            code: 'ACTION-002',
            appliedFor: {
              unit: 'm2',
              quantity: 10000
            }
          }
        ]
      }
    })
  })

  it('should call the answers transformer with the state object', () => {
    const identifiers = {
      sbi: '12345678',
      frn: 'FRN123456',
      crn: 'CRN789012',
      defraId: 'DEFRA-ID-123',
      clientRef: 'CLIENT-REF-456'
    }

    const state = { sbi: '12345678' }
    const mockAnswersTransformer = jest.fn().mockReturnValue({})

    transformStateObjectToGasApplication(
      identifiers,
      state,
      mockAnswersTransformer
    )

    expect(mockAnswersTransformer).toHaveBeenCalledTimes(1)
    expect(mockAnswersTransformer).toHaveBeenCalledWith(state)
  })
})

describe('schema validation', () => {
  it('output always conforms to GASPayload schema structure', () => {
    const identifiers = {
      sbi: '12345678',
      frn: 'FRN123456',
      crn: 'CRN789012',
      defraId: 'DEFRA-ID-123',
      clientRef: 'CLIENT-REF-456'
    }
    const stateObjectTestCases = [
      // Complete object being set
      {
        scheme: 'SFI',
        year: 2025,
        hasCheckedLandIsUpToDate: true,
        landParcel: 'SX0679-9238',
        actionsObj: {
          CSAM1: {
            value: '44',
            unit: 'ha'
          }
        }
      },
      // Minimal object with actions
      {
        landParcel: 'SX0679-9238',
        actionsObj: {
          CSAM1: {
            value: '44',
            unit: 'ha'
          }
        }
      },
      // Multiple actions with different formats
      {
        landParcel: 'SX0679-9238',
        actionsObj: {
          CSAM1: {
            value: '44',
            unit: 'ha'
          },
          CSAM2: {
            value: 'not-a-number',
            unit: 'm2'
          },
          CSAM3: {}
        }
      },
      // Only basic props
      {
        sbi: 'sbi-1234',
        frn: 'frn-1234'
      },
      // Empty object
      {}
    ]

    stateObjectTestCases.forEach((testCase) => {
      const result = transformStateObjectToGasApplication(
        identifiers,
        testCase,
        (a) => a
      )
      const { error } = validateGasPayload(result)

      // We check here that the output always adheres to GasPayload expectations in terms of format
      expect(error).toBeUndefined()
    })
  })
})

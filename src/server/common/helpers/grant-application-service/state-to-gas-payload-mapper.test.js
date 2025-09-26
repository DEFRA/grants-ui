import { vi } from 'vitest'
import { transformStateObjectToGasApplication } from '~/src/server/common/helpers/grant-application-service/state-to-gas-payload-mapper.js'

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

    const mockAnswersTransformer = vi.fn().mockReturnValue({
      scheme: 'Test Scheme',
      year: 2025
    })

    const result = transformStateObjectToGasApplication(identifiers, state, mockAnswersTransformer)

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

    const mockAnswersTransformer = vi.fn().mockReturnValue({
      scheme: 'Test Scheme'
    })

    const result = transformStateObjectToGasApplication(identifiers, state, mockAnswersTransformer)

    expect(result).toEqual({
      metadata: {
        sbi: '12345678',
        defraId: 'defraId',
        frn: 'frn',
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

    const mockAnswersTransformer = vi.fn().mockImplementation((state) => ({
      scheme: 'Land Grants',
      year: 2025,
      hasCheckedLandIsUpToDate: true,
      actionApplications: state.actionApplications
    }))

    const result = transformStateObjectToGasApplication(identifiers, state, mockAnswersTransformer)

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
    const mockAnswersTransformer = vi.fn().mockReturnValue({})

    transformStateObjectToGasApplication(identifiers, state, mockAnswersTransformer)

    expect(mockAnswersTransformer).toHaveBeenCalledTimes(1)
    expect(mockAnswersTransformer).toHaveBeenCalledWith(state)
  })
})

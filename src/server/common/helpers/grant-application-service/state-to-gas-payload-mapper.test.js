import { vi } from 'vitest'
import {
  resolveGasConfigVersion,
  transformStateObjectToGasApplication
} from '~/src/server/common/helpers/grant-application-service/state-to-gas-payload-mapper.js'

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
      clientRef: 'CLIENT-REF-456'
    }
    const state = {}

    const mockAnswersTransformer = vi.fn().mockReturnValue({
      scheme: 'Test Scheme',
      year: 2025
    })

    const result = transformStateObjectToGasApplication(identifiers, state, mockAnswersTransformer, '1.1.1')

    expect(result).toEqual({
      metadata: {
        sbi: '12345678',
        frn: 'FRN123456',
        crn: 'CRN789012',
        clientRef: 'CLIENT-REF-456',
        configVersion: expect.any(Semver),
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

    const result = transformStateObjectToGasApplication(identifiers, state, mockAnswersTransformer, '1.0.0')

    expect(result).toEqual({
      metadata: {
        sbi: '12345678',
        configVersion: expect.any(Semver),
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
      actionApplications: state.actionApplications
    }))

    const result = transformStateObjectToGasApplication(identifiers, state, mockAnswersTransformer, '2.0.0')

    expect(result).toEqual({
      metadata: {
        sbi: '12345678',
        frn: 'FRN123456',
        crn: 'CRN789012',
        clientRef: 'CLIENT-REF-456',
        configVersion: expect.any(Semver),
        submittedAt: mockDate.toISOString()
      },
      answers: {
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
      clientRef: 'CLIENT-REF-456'
    }

    const state = { sbi: '12345678' }
    const mockAnswersTransformer = vi.fn().mockReturnValue({})

    transformStateObjectToGasApplication(identifiers, state, mockAnswersTransformer, '1.1.1')

    expect(mockAnswersTransformer).toHaveBeenCalledTimes(1)
    expect(mockAnswersTransformer).toHaveBeenCalledWith(state)
  })

  it('should preserve a strict major.minor.patch semver string', () => {
    const identifiers = {
      sbi: '12345678'
    }
    const state = {}
    const mockAnswersTransformer = vi.fn().mockReturnValue({})

    const result = transformStateObjectToGasApplication(identifiers, state, mockAnswersTransformer, '3.2.1')

    expect(result.metadata?.configVersion).toBe('3.2.1')
  })

  // Config broker only supports strict major.minor.patch, so a `v` prefix,
  // prerelease tags and build metadata must all be rejected even though the
  // semver package itself tolerates them.
  it.each([
    undefined,
    null,
    '',
    1,
    '1',
    '1.0',
    '01.0.0',
    'v1.0.0',
    '1.0.0-beta.1',
    '1.0.0+build.4',
    '3.2.1-beta.2+build.4'
  ])('should throw when configVersion is not a strict semver string: %s', (configVersion) => {
    const identifiers = {
      sbi: '12345678',
      clientRef: 'CLIENT-REF-456'
    }
    const state = {}
    const mockAnswersTransformer = vi.fn().mockReturnValue({})

    expect(() =>
      transformStateObjectToGasApplication(identifiers, state, mockAnswersTransformer, configVersion)
    ).toThrow('Invalid grant config version')
    expect(mockAnswersTransformer).not.toHaveBeenCalled()
  })

  it.each(['', '1', '1.0', '01.0.0', 2, 'v1.0.0', '1.0.0-beta.1', '1.0.0+build.4'])(
    'should throw for invalid config version %s',
    (version) => {
      const request = { app: { model: { def: { metadata: { version } } } } }

      expect(() => resolveGasConfigVersion(request)).toThrow('Invalid grant config version')
    }
  )
})

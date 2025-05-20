import { config } from '~/src/config/config.js'
import {
  loadSubmissionSchemaValidators,
  validateSubmissionAnswers
} from '~/src/server/common/forms/services/submission.js'
import { stateToLandGrantsGasAnswers } from '~/src/server/land-grants/submission/state-to-gas-answers-mapper.js'

const frpsGrantCode = config.get('landGrants.grantCode')

describe('stateToLandGrantsGasAnswers', () => {
  it('should transform a complete object correctly', () => {
    const input = {
      hasCheckedLandIsUpToDate: true,
      landParcel: 'SX0679-9238',
      scheme: 'SFI',
      agreementName: "Joe's farm funding 2025",
      year: 2025,
      actionsObj: {
        CSAM1: {
          value: '44',
          unit: 'ha'
        }
      }
    }

    const expected = {
      scheme: 'SFI',
      year: 2025,
      hasCheckedLandIsUpToDate: true,
      agreementName: "Joe's farm funding 2025",
      actionApplications: [
        {
          parcelId: '9238',
          sheetId: 'SX0679',
          code: 'CSAM1',
          appliedFor: {
            unit: 'ha',
            quantity: 44
          }
        }
      ]
    }

    expect(stateToLandGrantsGasAnswers(input)).toEqual(expected)
  })

  it('should handle multiple actions with different units', () => {
    const input = {
      landParcel: 'SX0679-9238',
      actionsObj: {
        CSAM1: {
          value: '44',
          unit: 'ha'
        },
        CSAM2: {
          value: '100',
          unit: 'm2'
        },
        CSAM3: {
          value: '5',
          unit: 'count'
        }
      }
    }

    const expected = {
      scheme: 'SFI',
      year: 2025,
      actionApplications: [
        {
          parcelId: '9238',
          sheetId: 'SX0679',
          code: 'CSAM1',
          appliedFor: {
            unit: 'ha',
            quantity: 44
          }
        },
        {
          parcelId: '9238',
          sheetId: 'SX0679',
          code: 'CSAM2',
          appliedFor: {
            unit: 'm2',
            quantity: 100
          }
        },
        {
          parcelId: '9238',
          sheetId: 'SX0679',
          code: 'CSAM3',
          appliedFor: {
            unit: 'count',
            quantity: 5
          }
        }
      ]
    }

    expect(stateToLandGrantsGasAnswers(input)).toEqual(expected)
  })

  it('should not include actionApplications when landParcel is missing', () => {
    const input = {
      hasCheckedLandIsUpToDate: true,
      scheme: 'SFI',
      year: 2025,
      actionsObj: {
        CSAM1: {
          value: '44',
          unit: 'ha'
        }
      }
    }

    const expected = {
      hasCheckedLandIsUpToDate: true,
      scheme: 'SFI',
      year: 2025
    }

    expect(stateToLandGrantsGasAnswers(input)).toEqual(expected)
  })

  it('should not include actionApplications when actionsObj is missing', () => {
    const input = {
      scheme: 'SFI',
      year: 2025,
      hasCheckedLandIsUpToDate: true,
      landParcel: 'SX0679-9238'
    }

    const expected = {
      scheme: 'SFI',
      year: 2025,
      hasCheckedLandIsUpToDate: true
    }

    expect(stateToLandGrantsGasAnswers(input)).toEqual(expected)
  })

  it('should handle decimal values correctly', () => {
    const input = {
      landParcel: 'SX0679-9238',
      actionsObj: {
        CSAM1: {
          value: '44.75',
          unit: 'ha'
        }
      }
    }

    const expected = {
      scheme: 'SFI',
      year: 2025,
      actionApplications: [
        {
          parcelId: '9238',
          sheetId: 'SX0679',
          code: 'CSAM1',
          appliedFor: {
            unit: 'ha',
            quantity: 44.75
          }
        }
      ]
    }

    expect(stateToLandGrantsGasAnswers(input)).toEqual(expected)
  })

  it('should omit unit in appliedFor when unit is missing', () => {
    const input = {
      landParcel: 'SX0679-9238',
      actionsObj: {
        CSAM1: {
          value: '44'
          // unit is missing
        }
      }
    }

    const expected = {
      scheme: 'SFI',
      year: 2025,
      actionApplications: [
        {
          parcelId: '9238',
          sheetId: 'SX0679',
          code: 'CSAM1',
          appliedFor: {
            quantity: 44
          }
        }
      ]
    }

    expect(stateToLandGrantsGasAnswers(input)).toEqual(expected)
  })

  it('should omit quantity in appliedFor when value is missing', () => {
    const input = {
      landParcel: 'SX0679-9238',
      actionsObj: {
        CSAM1: {
          unit: 'ha'
          // value is missing
        }
      }
    }

    const expected = {
      scheme: 'SFI',
      year: 2025,
      actionApplications: [
        {
          parcelId: '9238',
          sheetId: 'SX0679',
          code: 'CSAM1',
          appliedFor: {
            unit: 'ha'
          }
        }
      ]
    }

    expect(stateToLandGrantsGasAnswers(input)).toEqual(expected)
  })

  it('should omit quantity when value is not a valid number', () => {
    const input = {
      landParcel: 'SX0679-9238',
      actionsObj: {
        CSAM1: {
          value: 'not-a-number',
          unit: 'ha'
        }
      }
    }

    const expected = {
      scheme: 'SFI',
      year: 2025,
      actionApplications: [
        {
          parcelId: '9238',
          sheetId: 'SX0679',
          code: 'CSAM1',
          appliedFor: {
            unit: 'ha'
          }
        }
      ]
    }

    expect(stateToLandGrantsGasAnswers(input)).toEqual(expected)
  })

  it('should omit appliedFor when action data is empty', () => {
    const input = {
      landParcel: 'SX0679-9238',
      actionsObj: {
        CSAM1: {} // Empty object
      }
    }

    const expected = {
      scheme: 'SFI',
      year: 2025,
      actionApplications: [
        {
          parcelId: '9238',
          sheetId: 'SX0679',
          code: 'CSAM1'
        }
      ]
    }

    expect(stateToLandGrantsGasAnswers(input)).toEqual(expected)
  })

  it('should omit appliedFor when action data is not an object', () => {
    const input = {
      landParcel: 'SX0679-9238',
      actionsObj: {
        CSAM1: 'string-value' // Not an object
      }
    }

    const expected = {
      scheme: 'SFI',
      year: 2025,
      actionApplications: [
        {
          parcelId: '9238',
          sheetId: 'SX0679',
          code: 'CSAM1'
        }
      ]
    }

    expect(stateToLandGrantsGasAnswers(input)).toEqual(expected)
  })

  it('should return only basic properties when no action data is provided', () => {
    const input = {
      scheme: 'SFI',
      year: 2025
    }

    const expected = {
      scheme: 'SFI',
      year: 2025
    }

    expect(stateToLandGrantsGasAnswers(input)).toEqual(expected)
  })

  it('should return minimal object when input is empty', () => {
    const input = {}
    const expected = {
      scheme: 'SFI',
      year: 2025
    }

    expect(stateToLandGrantsGasAnswers(input)).toEqual(expected)
  })

  it('should handle landParcel without dash', () => {
    const input = {
      landParcel: 'SX06799238', // No dash
      actionsObj: {
        CSAM1: {
          value: '44',
          unit: 'ha'
        }
      }
    }

    const expected = {
      scheme: 'SFI',
      year: 2025,
      actionApplications: [
        {
          sheetId: 'SX06799238', // The entire value becomes sheetId
          code: 'CSAM1',
          appliedFor: {
            unit: 'ha',
            quantity: 44
          }
        }
      ]
    }

    expect(stateToLandGrantsGasAnswers(input)).toEqual(expected)
  })

  it('should include zero as a valid quantity', () => {
    const input = {
      landParcel: 'SX0679-9238',
      actionsObj: {
        CSAM1: {
          value: '0',
          unit: 'ha'
        }
      }
    }

    const expected = {
      scheme: 'SFI',
      year: 2025,
      actionApplications: [
        {
          parcelId: '9238',
          sheetId: 'SX0679',
          code: 'CSAM1',
          appliedFor: {
            unit: 'ha',
            quantity: 0
          }
        }
      ]
    }

    expect(stateToLandGrantsGasAnswers(input)).toEqual(expected)
  })

  it('should handle landParcel with multiple dashes correctly', () => {
    const input = {
      landParcel: 'SX0679-9238-EXTRA',
      actionsObj: {
        CSAM1: {
          value: '44',
          unit: 'ha'
        }
      }
    }

    const expected = {
      scheme: 'SFI',
      year: 2025,
      actionApplications: [
        {
          sheetId: 'SX0679',
          parcelId: '9238', // Only takes the first part after the dash
          code: 'CSAM1',
          appliedFor: {
            unit: 'ha',
            quantity: 44
          }
        }
      ]
    }

    expect(stateToLandGrantsGasAnswers(input)).toEqual(expected)
  })

  it('should handle null values in actionsObj', () => {
    const input = {
      landParcel: 'SX0679-9238',
      actionsObj: {
        CSAM1: null
      }
    }

    const expected = {
      scheme: 'SFI',
      year: 2025,
      actionApplications: [
        {
          parcelId: '9238',
          sheetId: 'SX0679',
          code: 'CSAM1'
        }
      ]
    }

    expect(stateToLandGrantsGasAnswers(input)).toEqual(expected)
  })

  it('should handle mixed action data types', () => {
    const input = {
      landParcel: 'SX0679-9238',
      actionsObj: {
        CSAM1: {
          value: '44',
          unit: 'ha'
        },
        CSAM2: null,
        CSAM3: 'string-value',
        CSAM4: {}
      }
    }

    const expected = {
      scheme: 'SFI',
      year: 2025,
      actionApplications: [
        {
          parcelId: '9238',
          sheetId: 'SX0679',
          code: 'CSAM1',
          appliedFor: {
            unit: 'ha',
            quantity: 44
          }
        },
        {
          parcelId: '9238',
          sheetId: 'SX0679',
          code: 'CSAM2'
        },
        {
          parcelId: '9238',
          sheetId: 'SX0679',
          code: 'CSAM3'
        },
        {
          parcelId: '9238',
          sheetId: 'SX0679',
          code: 'CSAM4'
        }
      ]
    }

    expect(stateToLandGrantsGasAnswers(input)).toEqual(expected)
  })

  it('should handle string values with spaces', () => {
    const input = {
      landParcel: 'SX0679-9238',
      actionsObj: {
        CSAM1: {
          value: '  44  ',
          unit: '  ha  '
        }
      }
    }

    const expected = {
      scheme: 'SFI',
      year: 2025,
      actionApplications: [
        {
          parcelId: '9238',
          sheetId: 'SX0679',
          code: 'CSAM1',
          appliedFor: {
            unit: 'ha', // Units should be trimmed
            quantity: 44 // Values should be parsed to numbers, which removes spaces
          }
        }
      ]
    }

    expect(stateToLandGrantsGasAnswers(input)).toEqual(expected)
  })

  it('should handle numeric strings with leading zeros', () => {
    const input = {
      landParcel: 'SX0679-9238',
      actionsObj: {
        CSAM1: {
          value: '0044.50',
          unit: 'ha'
        }
      }
    }

    const expected = {
      scheme: 'SFI',
      year: 2025,
      actionApplications: [
        {
          parcelId: '9238',
          sheetId: 'SX0679',
          code: 'CSAM1',
          appliedFor: {
            unit: 'ha',
            quantity: 44.5 // Leading zeros should be removed in parsed number
          }
        }
      ]
    }

    expect(stateToLandGrantsGasAnswers(input)).toEqual(expected)
  })

  it('should handle undefined values in actionsObj', () => {
    const input = {
      landParcel: 'SX0679-9238',
      actionsObj: {
        CSAM1: undefined
      }
    }

    const expected = {
      scheme: 'SFI',
      year: 2025,
      actionApplications: [
        {
          parcelId: '9238',
          sheetId: 'SX0679',
          code: 'CSAM1'
        }
      ]
    }

    expect(stateToLandGrantsGasAnswers(input)).toEqual(expected)
  })
})

describe('schema validation', () => {
  beforeAll(() => {
    loadSubmissionSchemaValidators()
  })

  it('output always conforms to GASPayload schema structure', () => {
    const stateObjectTestCases = [
      // Complete object being set
      {
        sbi: 'sbi-1234',
        frn: 'frn-1234',
        crn: 'crn-1234',
        defraId: 'defra-id-1234',
        agreementName: "Joe's farm funding 2025",
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
        agreementName: "Joe's farm funding 2025",
        hasCheckedLandIsUpToDate: true,
        landParcel: 'SX0679-9238',
        actionsObj: {
          CSAM1: {
            value: '44',
            unit: 'ha'
          }
        }
      }
    ]

    stateObjectTestCases.forEach((testCase) => {
      const result = stateToLandGrantsGasAnswers(testCase)
      const { valid } = validateSubmissionAnswers(result, frpsGrantCode)

      // We check here that the output always adheres to GasPayload expectations in terms of format
      expect(valid).toBe(true)
    })
  })
})

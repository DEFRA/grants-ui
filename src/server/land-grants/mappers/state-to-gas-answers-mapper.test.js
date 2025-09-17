import { config } from '~/src/config/config.js'
import {
  loadSubmissionSchemaValidators,
  validateSubmissionAnswers
} from '~/src/server/common/forms/services/submission.js'
import { stateToLandGrantsGasAnswers } from '~/src/server/land-grants/mappers/state-to-gas-answers-mapper.js'

const frpsGrantCode = config.get('landGrants.grantCode')

const applicant = {
  business: {
    name: 'Test Business',
    email: {
      address: 'test@test.com.test'
    },
    phone: {
      mobile: '01234567890'
    },
    address: {
      line1: 'A place',
      line2: '',
      line3: null,
      line4: null,
      line5: null,
      street: 'A Street',
      city: 'A City',
      postalCode: 'AA1 1AA'
    }
  },
  customer: {
    name: {
      title: 'Mr.',
      first: 'Test',
      middle: 'Customer',
      last: 'Test'
    }
  }
}

const payment = {
  agreementStartDate: '2025-09-01',
  agreementEndDate: '2028-09-01',
  frequency: 'Quarterly',
  agreementTotalPence: 96018,
  annualTotalPence: 32006,
  parcelItems: {
    1: {
      code: 'CMOR1',
      description: 'CMOR1: Assess moorland and produce a written record',
      version: 1,
      unit: 'ha',
      quantity: 4.53411078,
      rateInPence: 1060,
      annualPaymentPence: 4806,
      sheetId: 'SD6743',
      parcelId: '8083'
    }
  },
  agreementLevelItems: {
    1: {
      code: 'CMOR1',
      description: 'CMOR1: Assess moorland and produce a written record',
      version: 1,
      annualPaymentPence: 27200
    }
  },
  payments: [
    {
      totalPaymentPence: 8007,
      paymentDate: '2025-12-05',
      lineItems: [
        {
          parcelItemId: 1,
          paymentPence: 1201
        },
        {
          agreementLevelItemId: 1,
          paymentPence: 6800
        }
      ]
    },
    {
      totalPaymentPence: 8001,
      paymentDate: '2026-03-05',
      lineItems: [
        {
          parcelItemId: 1,
          paymentPence: 1201
        },
        {
          agreementLevelItemId: 1,
          paymentPence: 6800
        }
      ]
    },
    {
      totalPaymentPence: 8001,
      paymentDate: '2026-06-05',
      lineItems: [
        {
          parcelItemId: 1,
          paymentPence: 1201
        },
        {
          agreementLevelItemId: 1,
          paymentPence: 6800
        }
      ]
    }
  ]
}

describe('stateToLandGrantsGasAnswers', () => {
  it('should transform a complete object correctly', () => {
    const input = {
      hasCheckedLandIsUpToDate: true,
      scheme: 'SFI',
      year: 2025,
      applicant,
      payment,
      landParcels: {
        'SX0679-9238': {
          actionsObj: {
            CSAM1: {
              value: '44',
              unit: 'ha'
            }
          }
        }
      }
    }

    const expected = {
      scheme: 'SFI',
      year: 2025,
      hasCheckedLandIsUpToDate: true,
      applicant,
      payment,
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
      landParcels: {
        'SX0679-9238': {
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
      }
    }

    const expected = {
      hasCheckedLandIsUpToDate: true,
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

  it('should include actionApplications when landParcels object is missing', () => {
    const input = {
      hasCheckedLandIsUpToDate: true,
      scheme: 'SFI',
      year: 2025,
      landParcels: {}
    }

    const expected = {
      hasCheckedLandIsUpToDate: true,
      scheme: 'SFI',
      year: 2025,
      actionApplications: []
    }

    expect(stateToLandGrantsGasAnswers(input)).toEqual(expected)
  })

  it('should not include actionApplications when actionsObj is missing', () => {
    const input = {
      scheme: 'SFI',
      year: 2025,
      hasCheckedLandIsUpToDate: true,
      landParcels: {
        'SX0679-9238': {}
      }
    }

    const expected = {
      scheme: 'SFI',
      year: 2025,
      hasCheckedLandIsUpToDate: true,
      actionApplications: []
    }

    expect(stateToLandGrantsGasAnswers(input)).toEqual(expected)
  })

  it('should handle decimal values correctly', () => {
    const input = {
      landParcels: {
        'SX0679-9238': {
          actionsObj: {
            CSAM1: {
              value: '44.75',
              unit: 'ha'
            }
          }
        }
      }
    }

    const expected = {
      hasCheckedLandIsUpToDate: true,
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
      landParcels: {
        'SX0679-9238': {
          actionsObj: {
            CSAM1: {
              value: '44'
              // unit is missing
            }
          }
        }
      }
    }

    const expected = {
      hasCheckedLandIsUpToDate: true,
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
      landParcels: {
        'SX0679-9238': {
          actionsObj: {
            CSAM1: {
              unit: 'ha'
              // value is missing
            }
          }
        }
      }
    }

    const expected = {
      hasCheckedLandIsUpToDate: true,
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
      landParcels: {
        'SX0679-9238': {
          actionsObj: {
            CSAM1: {
              value: 'not-a-number',
              unit: 'ha'
            }
          }
        }
      }
    }

    const expected = {
      hasCheckedLandIsUpToDate: true,
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
      landParcels: {
        'SX0679-9238': {
          actionsObj: {
            CSAM1: {}
          }
        }
      }
    }

    const expected = {
      hasCheckedLandIsUpToDate: true,
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
      landParcels: {
        'SX0679-9238': {
          actionsObj: {
            CSAM1: 'string-value' // Not an object
          }
        }
      }
    }

    const expected = {
      hasCheckedLandIsUpToDate: true,
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
      hasCheckedLandIsUpToDate: true,
      scheme: 'SFI',
      year: 2025,
      actionApplications: []
    }

    expect(stateToLandGrantsGasAnswers(input)).toEqual(expected)
  })

  it('should return minimal object when input is empty', () => {
    const input = {}
    const expected = {
      hasCheckedLandIsUpToDate: true,
      scheme: 'SFI',
      year: 2025,
      actionApplications: []
    }

    expect(stateToLandGrantsGasAnswers(input)).toEqual(expected)
  })

  it('should handle land parcels without dash', () => {
    const input = {
      landParcels: {
        SX06799238: {
          actionsObj: {
            CSAM1: {
              value: '44',
              unit: 'ha'
            }
          }
        }
      }
    }

    const expected = {
      hasCheckedLandIsUpToDate: true,
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
      landParcels: {
        'SX0679-9238': {
          actionsObj: {
            CSAM1: {
              value: '0',
              unit: 'ha'
            }
          }
        }
      }
    }

    const expected = {
      hasCheckedLandIsUpToDate: true,
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

  it('should handle landParcels with multiple dashes correctly', () => {
    const input = {
      landParcels: {
        'SX0679-9238-EXTRA': {
          actionsObj: {
            CSAM1: {
              value: '44',
              unit: 'ha'
            }
          }
        }
      }
    }

    const expected = {
      hasCheckedLandIsUpToDate: true,
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
      landParcels: {
        'SX0679-9238': {
          actionsObj: {
            CSAM1: null // Null value for action
          }
        }
      }
    }

    const expected = {
      hasCheckedLandIsUpToDate: true,
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
      landParcels: {
        'SX0679-9238': {
          actionsObj: {
            CSAM1: {
              value: '44',
              unit: 'ha'
            },
            CSAM2: null, // Null action
            CSAM3: 'string-value', // String action
            CSAM4: {} // Empty object action
          }
        }
      }
    }

    const expected = {
      hasCheckedLandIsUpToDate: true,
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
      landParcels: {
        'SX0679-9238': {
          actionsObj: {
            CSAM1: {
              value: '  44  ', // String with leading and trailing spaces
              unit: '  ha  ' // Unit with spaces
            }
          }
        }
      }
    }

    const expected = {
      hasCheckedLandIsUpToDate: true,
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
      landParcels: {
        'SX0679-9238': {
          actionsObj: {
            CSAM1: {
              value: '0044.50', // Numeric string with leading zeros
              unit: 'ha'
            }
          }
        }
      }
    }

    const expected = {
      hasCheckedLandIsUpToDate: true,
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
      landParcels: {
        'SX0679-9238': {
          actionsObj: {
            CSAM1: undefined // Undefined action
          }
        }
      }
    }

    const expected = {
      hasCheckedLandIsUpToDate: true,
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
        scheme: 'SFI',
        year: 2025,
        hasCheckedLandIsUpToDate: true,
        applicant,
        payment,
        landParcels: {
          'SX0679-9238': {
            actionsObj: {
              CSAM1: {
                value: '44',
                unit: 'ha'
              }
            }
          }
        }
      },
      // Minimal object with actions
      {
        hasCheckedLandIsUpToDate: true,
        applicant,
        payment,
        landParcels: {
          'SX0679-9238': {
            actionsObj: {
              CSAM1: {
                value: '44',
                unit: 'ha'
              }
            }
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

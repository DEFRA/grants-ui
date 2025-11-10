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
      code: 'CSAM1',
      description: 'CSAM1: Assess moorland and produce a written record',
      durationYears: 3,
      version: 1,
      unit: 'ha',
      quantity: 4.53411078,
      rateInPence: 1060,
      annualPaymentPence: 4806,
      sheetId: 'SX0679',
      parcelId: '9238'
    }
  },
  agreementLevelItems: {
    1: {
      code: 'CSAM1',
      description: 'CSAM1: Assess moorland and produce a written record',
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
      applicant,
      payment,
      landParcels: {
        'SX0679-9238': {
          size: {
            value: 10.5,
            unit: 'ha'
          },
          actionsObj: {
            CSAM1: {
              value: '44',
              unit: 'ha'
            }
          }
        }
      },
      applicationValidationRunId: '12345678'
    }

    const expected = {
      scheme: 'SFI',
      applicant,
      applicationValidationRunId: '12345678',
      totalAnnualPaymentPence: 32006,
      parcels: [
        {
          sheetId: 'SX0679',
          parcelId: '9238',
          area: {
            unit: 'ha',
            quantity: 10.5
          },
          actions: [
            {
              code: 'CSAM1',
              description: 'CSAM1: Assess moorland and produce a written record',
              durationYears: 3,
              eligible: {
                unit: 'ha',
                quantity: 44
              },
              appliedFor: {
                unit: 'ha',
                quantity: 44
              },
              paymentRates: {
                ratePerUnitPence: 1060,
                agreementLevelAmountPence: 27200
              },
              annualPaymentPence: 4806
            }
          ]
        }
      ]
    }

    expect(stateToLandGrantsGasAnswers(input)).toEqual(expected)
  })

  it('should handle multiple actions with different units', () => {
    const paymentMultiple = {
      ...payment,
      parcelItems: {
        1: {
          code: 'CSAM1',
          description: 'Action 1',
          durationYears: 3,
          unit: 'ha',
          quantity: 44,
          rateInPence: 1060,
          annualPaymentPence: 4664,
          sheetId: 'SX0679',
          parcelId: '9238'
        },
        2: {
          code: 'CSAM2',
          description: 'Action 2',
          durationYears: 3,
          unit: 'm2',
          quantity: 100,
          rateInPence: 50,
          annualPaymentPence: 5000,
          sheetId: 'SX0679',
          parcelId: '9238'
        },
        3: {
          code: 'CSAM3',
          description: 'Action 3',
          durationYears: 3,
          unit: 'count',
          quantity: 5,
          rateInPence: 200,
          annualPaymentPence: 1000,
          sheetId: 'SX0679',
          parcelId: '9238'
        }
      }
    }

    const input = {
      payment: paymentMultiple,
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
      },
      applicationValidationRunId: '12345678'
    }

    const result = stateToLandGrantsGasAnswers(input)

    expect(result.parcels).toHaveLength(1)
    expect(result.parcels[0].actions).toHaveLength(3)
    expect(result.parcels[0].actions[0]).toMatchObject({
      code: 'CSAM1',
      appliedFor: { unit: 'ha', quantity: 44 }
    })
    expect(result.parcels[0].actions[1]).toMatchObject({
      code: 'CSAM2',
      appliedFor: { unit: 'm2', quantity: 100 }
    })
    expect(result.parcels[0].actions[2]).toMatchObject({
      code: 'CSAM3',
      appliedFor: { unit: 'count', quantity: 5 }
    })
  })

  it('should include empty parcels array when landParcels object is missing', () => {
    const input = {
      payment,
      landParcels: {},
      applicationValidationRunId: '12345678'
    }

    const result = stateToLandGrantsGasAnswers(input)

    expect(result.parcels).toEqual([])
    expect(result.totalAnnualPaymentPence).toBe(32006)
  })

  it('should create parcel with empty actions when actionsObj is missing', () => {
    const input = {
      payment,
      landParcels: {
        'SX0679-9238': {
          size: {
            value: 10,
            unit: 'ha'
          }
        }
      },
      applicationValidationRunId: '12345678'
    }

    const result = stateToLandGrantsGasAnswers(input)

    expect(result.parcels).toHaveLength(1)
    expect(result.parcels[0].actions).toEqual([])
    expect(result.parcels[0].area).toEqual({ unit: 'ha', quantity: 10 })
  })

  it('should handle decimal values correctly', () => {
    const input = {
      payment,
      landParcels: {
        'SX0679-9238': {
          actionsObj: {
            CSAM1: {
              value: '44.75',
              unit: 'ha'
            }
          }
        }
      },
      applicationValidationRunId: '12345678'
    }

    const result = stateToLandGrantsGasAnswers(input)

    expect(result.parcels[0].actions[0].appliedFor).toEqual({
      unit: 'ha',
      quantity: 44.75
    })
  })

  it('should omit unit in appliedFor when unit is missing', () => {
    const input = {
      payment,
      landParcels: {
        'SX0679-9238': {
          actionsObj: {
            CSAM1: {
              value: '44'
            }
          }
        }
      },
      applicationValidationRunId: '12345678'
    }

    const result = stateToLandGrantsGasAnswers(input)

    expect(result.parcels[0].actions[0].appliedFor).toEqual({
      quantity: 44
    })
    expect(result.parcels[0].actions[0].appliedFor.unit).toBeUndefined()
  })

  it('should omit quantity in appliedFor when value is missing', () => {
    const input = {
      payment,
      landParcels: {
        'SX0679-9238': {
          actionsObj: {
            CSAM1: {
              unit: 'ha'
            }
          }
        }
      },
      applicationValidationRunId: '12345678'
    }

    const result = stateToLandGrantsGasAnswers(input)

    expect(result.parcels[0].actions[0].appliedFor).toEqual({
      unit: 'ha'
    })
    expect(result.parcels[0].actions[0].appliedFor.quantity).toBeUndefined()
  })

  it('should omit quantity when value is not a valid number', () => {
    const input = {
      payment,
      landParcels: {
        'SX0679-9238': {
          actionsObj: {
            CSAM1: {
              value: 'not-a-number',
              unit: 'ha'
            }
          }
        }
      },
      applicationValidationRunId: '12345678'
    }

    const result = stateToLandGrantsGasAnswers(input)

    expect(result.parcels[0].actions[0].appliedFor).toEqual({
      unit: 'ha'
    })
  })

  it('should create action with empty eligible/appliedFor when action data is empty', () => {
    const input = {
      payment,
      landParcels: {
        'SX0679-9238': {
          actionsObj: {
            CSAM1: {}
          }
        }
      },
      applicationValidationRunId: '12345678'
    }

    const result = stateToLandGrantsGasAnswers(input)

    expect(result.parcels[0].actions[0].code).toBe('CSAM1')
    expect(result.parcels[0].actions[0].eligible).toEqual({})
    expect(result.parcels[0].actions[0].appliedFor).toEqual({})
  })

  it('should return empty parcels when no action data is provided', () => {
    const input = {
      payment,
      applicationValidationRunId: '12345678'
    }

    const result = stateToLandGrantsGasAnswers(input)

    expect(result.parcels).toEqual([])
    expect(result.totalAnnualPaymentPence).toBe(32006)
  })

  it('should handle land parcels without dash', () => {
    const paymentNoDash = {
      ...payment,
      parcelItems: {
        1: {
          ...payment.parcelItems[1],
          sheetId: 'SX06799238',
          parcelId: undefined
        }
      }
    }

    const input = {
      payment: paymentNoDash,
      landParcels: {
        SX06799238: {
          actionsObj: {
            CSAM1: {
              value: '44',
              unit: 'ha'
            }
          }
        }
      },
      applicationValidationRunId: '12345678'
    }

    const result = stateToLandGrantsGasAnswers(input)

    expect(result.parcels[0].sheetId).toBe('SX06799238')
    expect(result.parcels[0].parcelId).toBeUndefined()
  })

  it('should include zero as a valid quantity', () => {
    const input = {
      payment,
      landParcels: {
        'SX0679-9238': {
          actionsObj: {
            CSAM1: {
              value: '0',
              unit: 'ha'
            }
          }
        }
      },
      applicationValidationRunId: '12345678'
    }

    const result = stateToLandGrantsGasAnswers(input)

    expect(result.parcels[0].actions[0].appliedFor).toEqual({
      unit: 'ha',
      quantity: 0
    })
  })

  it('should handle landParcels with multiple dashes correctly', () => {
    const input = {
      payment,
      landParcels: {
        'SX0679-9238-EXTRA': {
          actionsObj: {
            CSAM1: {
              value: '44',
              unit: 'ha'
            }
          }
        }
      },
      applicationValidationRunId: '12345678'
    }

    const result = stateToLandGrantsGasAnswers(input)

    expect(result.parcels[0].sheetId).toBe('SX0679')
    expect(result.parcels[0].parcelId).toBe('9238')
  })

  it('should handle string values with spaces', () => {
    const input = {
      payment,
      landParcels: {
        'SX0679-9238': {
          actionsObj: {
            CSAM1: {
              value: '  44  ',
              unit: '  ha  '
            }
          }
        }
      },
      applicationValidationRunId: '12345678'
    }

    const result = stateToLandGrantsGasAnswers(input)

    expect(result.parcels[0].actions[0].appliedFor).toEqual({
      unit: 'ha',
      quantity: 44
    })
  })

  it('should include payment information from parcelItems and agreementLevelItems', () => {
    const input = {
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
      },
      applicationValidationRunId: '12345678'
    }

    const result = stateToLandGrantsGasAnswers(input)

    expect(result.parcels[0].actions[0].paymentRates).toEqual({
      ratePerUnitPence: 1060,
      agreementLevelAmountPence: 27200
    })
    expect(result.parcels[0].actions[0].annualPaymentPence).toBe(4806)
  })

  it('should handle payment data with both parcel and agreement level items', () => {
    const input = {
      payment: {
        annualTotalPence: 50000,
        parcelItems: {
          1: {
            code: 'CSAM1',
            sheetId: 'SX0679',
            parcelId: '9238',
            description: 'Parcel description',
            durationYears: 3,
            rateInPence: 1000,
            annualPaymentPence: 3000
          }
        },
        agreementLevelItems: {
          1: {
            code: 'CSAM1',
            description: 'Agreement description',
            durationYears: 3,
            annualPaymentPence: 5000
          }
        }
      },
      landParcels: {
        'SX0679-9238': {
          actionsObj: {
            CSAM1: {
              value: '10',
              unit: 'ha'
            }
          }
        }
      },
      applicationValidationRunId: '12345'
    }

    const result = stateToLandGrantsGasAnswers(input)

    expect(result.parcels[0].actions[0].paymentRates).toEqual({
      ratePerUnitPence: 1000,
      agreementLevelAmountPence: 5000
    })
    expect(result.parcels[0].actions[0].annualPaymentPence).toBe(3000)
  })

  it('should handle payment data with only agreement level items', () => {
    const input = {
      payment: {
        annualTotalPence: 50000,
        agreementLevelItems: {
          1: {
            code: 'CSAM1',
            description: 'Agreement description',
            durationYears: 3,
            annualPaymentPence: 5000
          }
        }
      },
      landParcels: {
        'SX0679-9238': {
          actionsObj: {
            CSAM1: {
              value: '10',
              unit: 'ha'
            }
          }
        }
      },
      applicationValidationRunId: '12345'
    }

    const result = stateToLandGrantsGasAnswers(input)

    expect(result.parcels[0].actions[0].paymentRates).toEqual({
      agreementLevelAmountPence: 5000
    })
    expect(result.parcels[0].actions[0].description).toBe('Agreement description')
  })

  it('should handle payment data with only parcel level items', () => {
    const input = {
      payment: {
        annualTotalPence: 50000,
        parcelItems: {
          1: {
            code: 'CSAM1',
            sheetId: 'SX0679',
            parcelId: '9238',
            description: 'Parcel description',
            durationYears: 3,
            rateInPence: 1000,
            annualPaymentPence: 3000
          }
        }
      },
      landParcels: {
        'SX0679-9238': {
          actionsObj: {
            CSAM1: {
              value: '10',
              unit: 'ha'
            }
          }
        }
      },
      applicationValidationRunId: '12345'
    }

    const result = stateToLandGrantsGasAnswers(input)

    expect(result.parcels[0].actions[0].paymentRates).toEqual({
      ratePerUnitPence: 1000
    })
    expect(result.parcels[0].actions[0].description).toBe('Parcel description')
  })

  it('should not include payment rates when payment item is null', () => {
    const input = {
      payment: {
        annualTotalPence: 50000,
        parcelItems: {},
        agreementLevelItems: {}
      },
      landParcels: {
        'SX0679-9238': {
          actionsObj: {
            UNKNOWN: {
              value: '10',
              unit: 'ha'
            }
          }
        }
      },
      applicationValidationRunId: '12345'
    }

    const result = stateToLandGrantsGasAnswers(input)

    expect(result.parcels[0].actions[0].paymentRates).toBeUndefined()
    expect(result.parcels[0].actions[0].annualPaymentPence).toBeUndefined()
  })

  it('should handle parcel with size data', () => {
    const input = {
      payment,
      landParcels: {
        'SX0679-9238': {
          size: {
            value: 15.5,
            unit: 'ha'
          },
          actionsObj: {
            CSAM1: {
              value: '10',
              unit: 'ha'
            }
          }
        }
      },
      applicationValidationRunId: '12345'
    }

    const result = stateToLandGrantsGasAnswers(input)

    expect(result.parcels[0].area).toEqual({
      unit: 'ha',
      quantity: 15.5
    })
  })

  it('should handle missing applicant', () => {
    const input = {
      payment,
      landParcels: {
        'SX0679-9238': {
          actionsObj: {
            CSAM1: {
              value: '10',
              unit: 'ha'
            }
          }
        }
      },
      applicationValidationRunId: '12345'
    }

    const result = stateToLandGrantsGasAnswers(input)

    expect(result.applicant).toBeUndefined()
    expect(result.scheme).toBe('SFI')
  })

  it('should handle durationYears being 0', () => {
    const input = {
      payment: {
        annualTotalPence: 50000,
        parcelItems: {
          1: {
            code: 'CSAM1',
            sheetId: 'SX0679',
            parcelId: '9238',
            description: 'Test',
            durationYears: 0,
            annualPaymentPence: 3000
          }
        }
      },
      landParcels: {
        'SX0679-9238': {
          actionsObj: {
            CSAM1: {
              value: '10',
              unit: 'ha'
            }
          }
        }
      },
      applicationValidationRunId: '12345'
    }

    const result = stateToLandGrantsGasAnswers(input)

    expect(result.parcels[0].actions[0].durationYears).toBe(0)
  })

  it('should handle annualPaymentPence being 0', () => {
    const input = {
      payment: {
        annualTotalPence: 0,
        parcelItems: {
          1: {
            code: 'CSAM1',
            sheetId: 'SX0679',
            parcelId: '9238',
            description: 'Test',
            durationYears: 3,
            annualPaymentPence: 0
          }
        }
      },
      landParcels: {
        'SX0679-9238': {
          actionsObj: {
            CSAM1: {
              value: '10',
              unit: 'ha'
            }
          }
        }
      },
      applicationValidationRunId: '12345'
    }

    const result = stateToLandGrantsGasAnswers(input)

    expect(result.totalAnnualPaymentPence).toBe(0)
    expect(result.parcels[0].actions[0].annualPaymentPence).toBe(0)
  })

  it('should not include description when missing from payment item', () => {
    const input = {
      payment: {
        annualTotalPence: 50000,
        parcelItems: {
          1: {
            code: 'CSAM1',
            sheetId: 'SX0679',
            parcelId: '9238',
            durationYears: 3,
            annualPaymentPence: 3000
          }
        }
      },
      landParcels: {
        'SX0679-9238': {
          actionsObj: {
            CSAM1: {
              value: '10',
              unit: 'ha'
            }
          }
        }
      },
      applicationValidationRunId: '12345'
    }

    const result = stateToLandGrantsGasAnswers(input)

    expect(result.parcels[0].actions[0].description).toBeUndefined()
  })
})

describe('schema validation', () => {
  beforeAll(() => {
    loadSubmissionSchemaValidators()
  })

  it('output always conforms to GASPayload schema structure', () => {
    const stateObjectTestCases = [
      // Complete object
      {
        applicant,
        payment,
        landParcels: {
          'SX0679-9238': {
            size: {
              value: 10,
              unit: 'ha'
            },
            actionsObj: {
              CSAM1: {
                value: '44',
                unit: 'ha'
              }
            }
          }
        },
        applicationValidationRunId: '355'
      },
      // Minimal object with actions
      {
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
        },
        applicationValidationRunId: '355'
      }
    ]

    stateObjectTestCases.forEach((testCase) => {
      const result = stateToLandGrantsGasAnswers(testCase)
      const { valid } = validateSubmissionAnswers(result, frpsGrantCode)

      expect(valid).toBe(true)
    })
  })
})

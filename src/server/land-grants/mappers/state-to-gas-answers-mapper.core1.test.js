import { stateToLandGrantsGasAnswers } from '~/src/server/land-grants/mappers/state-to-gas-answers-mapper.js'
import { applicant, payment } from './state-to-gas-answers-mapper.test-helpers.js'

vi.mock('~/src/config/config.js', async () => {
  const { mockConfigWithState } = await import('~/src/__mocks__/config-mocks.js')
  return mockConfigWithState()
})

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
              unit: 'ha',
              version: '1.0.0'
            }
          }
        }
      }
    }

    const expected = {
      rulesCalculations: undefined,
      scheme: 'SFI',
      applicant,
      totalAnnualPaymentPence: 32006,
      application: {
        parcel: [
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
                version: '1.0.0',
                durationYears: 3,
                appliedFor: {
                  unit: 'ha',
                  quantity: 44
                }
              }
            ]
          }
        ],
        agreement: []
      },
      payments: {
        parcel: [
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
                version: '1.0.0',
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
                paymentRates: 1060,
                annualPaymentPence: 4806
              }
            ]
          }
        ],
        agreement: [
          {
            code: 'CSAM1',
            description: 'CSAM1: Assess moorland and produce a written record',
            durationYears: 3,
            paymentRates: 27200,
            annualPaymentPence: 27200
          }
        ]
      }
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
          version: 1,
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
          version: 1,
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
          version: 1,
          unit: 'count',
          quantity: 5,
          rateInPence: 200,
          annualPaymentPence: 1000,
          sheetId: 'SX0679',
          parcelId: '9238'
        }
      },
      agreementLevelItems: {
        1: {
          code: 'CSAM1',
          description: 'Agreement Action 1',
          durationYears: 3,
          version: 1,
          rateInPence: 100,
          annualPaymentPence: 100
        },
        2: {
          code: 'CSAM2',
          description: 'Agreement Action 2',
          durationYears: 3,
          version: 1,
          rateInPence: 200,
          annualPaymentPence: 200
        },
        3: {
          code: 'CSAM3',
          description: 'Agreement Action 3',
          durationYears: 3,
          version: 1,
          rateInPence: 300,
          annualPaymentPence: 300
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
              unit: 'ha',
              version: '1.0.0'
            },
            CSAM2: {
              value: '100',
              unit: 'm2',
              version: '1.0.0'
            },
            CSAM3: {
              value: '5',
              unit: 'count',
              version: '1.0.0'
            }
          }
        }
      }
    }

    const result = stateToLandGrantsGasAnswers(input)

    expect(result.application.parcel).toHaveLength(1)
    expect(result.application.parcel[0].actions).toHaveLength(3)
    expect(result.application.parcel[0].actions[0]).toMatchObject({
      code: 'CSAM1',
      version: '1.0.0',
      appliedFor: { unit: 'ha', quantity: 44 }
    })
    expect(result.application.parcel[0].actions[1]).toMatchObject({
      code: 'CSAM2',
      version: '1.0.0',
      appliedFor: { unit: 'm2', quantity: 100 }
    })
    expect(result.application.parcel[0].actions[2]).toMatchObject({
      code: 'CSAM3',
      version: '1.0.0',
      appliedFor: { unit: 'count', quantity: 5 }
    })

    expect(result.application.agreement).toHaveLength(0)
    expect(result.payments.agreement).toHaveLength(3)
  })

  it('should return empty parcels when landParcels is an empty object', () => {
    const input = {
      payment,
      landParcels: {}
    }

    const result = stateToLandGrantsGasAnswers(input)

    expect(result.application.parcel).toEqual([])
    expect(result.payments.parcel).toEqual([])
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
      }
    }

    const result = stateToLandGrantsGasAnswers(input)

    expect(result.application.parcel).toHaveLength(1)
    expect(result.application.parcel[0].actions).toEqual([])
    expect(result.application.parcel[0].area).toEqual({ unit: 'ha', quantity: 10 })
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
      }
    }

    const result = stateToLandGrantsGasAnswers(input)

    expect(result.application.parcel[0].actions[0].appliedFor).toEqual({
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
      }
    }

    const result = stateToLandGrantsGasAnswers(input)

    expect(result.application.parcel[0].actions[0].appliedFor).toEqual({
      quantity: 44
    })
    expect(result.application.parcel[0].actions[0].appliedFor.unit).toBeUndefined()
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
      }
    }

    const result = stateToLandGrantsGasAnswers(input)

    expect(result.application.parcel[0].actions[0].appliedFor).toEqual({
      unit: 'ha'
    })
    expect(result.application.parcel[0].actions[0].appliedFor.quantity).toBeUndefined()
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
      }
    }

    const result = stateToLandGrantsGasAnswers(input)

    expect(result.application.parcel[0].actions[0].appliedFor).toEqual({
      unit: 'ha'
    })
  })

  it('should create action with empty appliedFor when action data is empty', () => {
    const input = {
      payment,
      landParcels: {
        'SX0679-9238': {
          actionsObj: {
            CSAM1: {}
          }
        }
      }
    }

    const result = stateToLandGrantsGasAnswers(input)

    expect(result.application.parcel[0].actions[0].code).toBe('CSAM1')
    expect(result.application.parcel[0].actions[0].appliedFor).toEqual({})
    expect(result.payments.parcel[0].actions[0].eligible).toEqual({})
    expect(result.payments.parcel[0].actions[0].appliedFor).toEqual({})
  })

  it('should return empty parcels when landParcels is omitted from state', () => {
    const input = {
      payment
    }

    const result = stateToLandGrantsGasAnswers(input)

    expect(result.application.parcel).toEqual([])
    expect(result.payments.parcel).toEqual([])
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
      }
    }

    const result = stateToLandGrantsGasAnswers(input)

    expect(result.application.parcel[0].sheetId).toBe('SX06799238')
    expect(result.application.parcel[0].parcelId).toBeUndefined()
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
      }
    }

    const result = stateToLandGrantsGasAnswers(input)

    expect(result.application.parcel[0].actions[0].appliedFor).toEqual({
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
      }
    }

    const result = stateToLandGrantsGasAnswers(input)

    expect(result.application.parcel[0].sheetId).toBe('SX0679')
    expect(result.application.parcel[0].parcelId).toBe('9238')
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
      }
    }

    const result = stateToLandGrantsGasAnswers(input)

    expect(result.application.parcel[0].actions[0].appliedFor).toEqual({
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
      }
    }

    const result = stateToLandGrantsGasAnswers(input)

    expect(result.payments.parcel[0].actions[0].paymentRates).toBe(1060)
    expect(result.payments.parcel[0].actions[0].annualPaymentPence).toBe(4806)
    expect(result.payments.agreement[0].paymentRates).toBe(27200)
    expect(result.payments.agreement[0].annualPaymentPence).toBe(27200)
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
            rateInPence: 5000,
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
      }
    }

    const result = stateToLandGrantsGasAnswers(input)

    expect(result.payments.parcel[0].actions[0].paymentRates).toBe(1000)
    expect(result.payments.parcel[0].actions[0].annualPaymentPence).toBe(3000)
    expect(result.payments.agreement[0].paymentRates).toBe(5000)
    expect(result.payments.agreement[0].annualPaymentPence).toBe(5000)
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
            rateInPence: 5000,
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
      }
    }

    const result = stateToLandGrantsGasAnswers(input)

    expect(result.payments.parcel[0].actions[0].paymentRates).toBeUndefined()
    expect(result.payments.parcel[0].actions[0].description).toBeUndefined()
    expect(result.payments.agreement[0].description).toBe('Agreement description')
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
      }
    }

    const result = stateToLandGrantsGasAnswers(input)

    expect(result.payments.parcel[0].actions[0].paymentRates).toBe(1000)
    expect(result.payments.parcel[0].actions[0].description).toBe('Parcel description')
  })
})

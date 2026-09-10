import { stateToLandGrantsGasAnswers } from '~/src/server/land-grants/mappers/state-to-gas-answers-mapper.js'
import { configState } from '~/src/__mocks__/config-mocks.js'
import { applicant, payment } from './state-to-gas-answers-mapper.test-helpers.js'

vi.mock('~/src/config/config.js', async () => {
  const { mockConfigWithState } = await import('~/src/__mocks__/config-mocks.js')
  return mockConfigWithState()
})

describe('stateToLandGrantsGasAnswers', () => {
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
      }
    }

    const result = stateToLandGrantsGasAnswers(input)

    expect(result.payments.parcel[0].actions[0].paymentRates).toBeUndefined()
    expect(result.payments.parcel[0].actions[0].annualPaymentPence).toBeUndefined()
  })

  it('should return empty agreement array when agreementLevelItems is missing', () => {
    const input = {
      payment: { annualTotalPence: 50000, parcelItems: {} },
      landParcels: {}
    }

    const result = stateToLandGrantsGasAnswers(input)

    expect(result.payments.agreement).toEqual([])
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
      }
    }

    const result = stateToLandGrantsGasAnswers(input)

    expect(result.application.parcel[0].area).toEqual({
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
      }
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
      }
    }

    const result = stateToLandGrantsGasAnswers(input)

    expect(result.application.parcel[0].actions[0].durationYears).toBe(0)
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
      }
    }

    const result = stateToLandGrantsGasAnswers(input)

    expect(result.totalAnnualPaymentPence).toBe(0)
    expect(result.payments.parcel[0].actions[0].annualPaymentPence).toBe(0)
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
      }
    }

    const result = stateToLandGrantsGasAnswers(input)

    expect(result.payments.parcel[0].actions[0].description).toBeUndefined()
  })

  it('should collect unique agreement actions from multiple parcels', () => {
    const input = {
      payment: {
        annualTotalPence: 50000,
        parcelItems: {
          1: {
            code: 'CSAM1',
            sheetId: 'SX0679',
            parcelId: '9238',
            description: 'Action 1',
            durationYears: 3,
            rateInPence: 1000,
            annualPaymentPence: 3000
          },
          2: {
            code: 'CSAM2',
            sheetId: 'AB1234',
            parcelId: '5678',
            description: 'Action 2',
            durationYears: 3,
            rateInPence: 2000,
            annualPaymentPence: 4000
          }
        },
        agreementLevelItems: {
          1: {
            code: 'CSAM1',
            description: 'Agreement 1',
            durationYears: 3,
            rateInPence: 100,
            annualPaymentPence: 100
          },
          2: {
            code: 'CSAM2',
            description: 'Agreement 2',
            durationYears: 3,
            rateInPence: 200,
            annualPaymentPence: 200
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
        },
        'AB1234-5678': {
          actionsObj: {
            CSAM1: {
              value: '5',
              unit: 'ha'
            },
            CSAM2: {
              value: '8',
              unit: 'ha'
            }
          }
        }
      }
    }

    const result = stateToLandGrantsGasAnswers(input)

    expect(result.application.agreement).toHaveLength(0)
    expect(result.payments.agreement).toHaveLength(2)

    const paymentAgreementCodes = result.payments.agreement.map((a) => a.code)
    expect(paymentAgreementCodes).toContain('CSAM1')
    expect(paymentAgreementCodes).toContain('CSAM2')
  })

  it.each([null, undefined])(
    'should treat %s actionsObj entries as having no eligible/appliedFor data',
    (actionValue) => {
      const input = {
        payment: {
          annualTotalPence: 5000,
          parcelItems: {
            1: { code: 'CSAM1', sheetId: 'SX0679', parcelId: '9238', durationYears: 3, rateInPence: 1000 }
          }
        },
        landParcels: {
          'SX0679-9238': { size: { value: 10, unit: 'ha' }, actionsObj: { CSAM1: actionValue } }
        }
      }

      const result = stateToLandGrantsGasAnswers(input)

      expect(result.payments.parcel[0].actions[0].eligible).toBeUndefined()
      expect(result.payments.parcel[0].actions[0].appliedFor).toBeUndefined()
    }
  )

  it('should omit an agreement item once its payment data becomes unavailable mid-lookup', () => {
    let accessCount = 0
    const agreementItems = {
      1: { code: 'CSAM1', description: 'Test agreement', durationYears: 3, annualPaymentPence: 5000 }
    }

    const payment = {
      annualTotalPence: 5000,
      parcelItems: {},
      get agreementLevelItems() {
        accessCount++
        return accessCount <= 2 ? agreementItems : undefined
      }
    }

    const result = stateToLandGrantsGasAnswers({ payment, landParcels: {} })

    expect(result.payments.agreement).toEqual([])
  })

  it('should only include actions in agreement arrays that exist in agreementLevelItems', () => {
    const input = {
      payment: {
        annualTotalPence: 28409,
        parcelItems: {
          1: {
            code: 'UPL1',
            description: 'Moderate livestock grazing on moorland',
            durationYears: 3,
            version: 1,
            unit: 'ha',
            quantity: 0.1447,
            rateInPence: 2000,
            annualPaymentPence: 289,
            sheetId: 'SD6843',
            parcelId: '9485'
          },
          2: {
            code: 'CMOR1',
            description: 'Assess moorland and produce a written record',
            durationYears: 3,
            version: 1,
            unit: 'ha',
            quantity: 0.1447,
            rateInPence: 1060,
            annualPaymentPence: 153,
            sheetId: 'SD6843',
            parcelId: '9485'
          },
          3: {
            code: 'UPL2',
            description: 'Low livestock grazing on moorland',
            durationYears: 3,
            version: 1,
            unit: 'ha',
            quantity: 0.0792,
            rateInPence: 5300,
            annualPaymentPence: 419,
            sheetId: 'SD6843',
            parcelId: '9381'
          }
        },
        agreementLevelItems: {
          1: {
            code: 'CMOR1',
            description: 'Assess moorland and produce a written record',
            durationYears: 3,
            version: 1,
            annualPaymentPence: 27200
          }
        }
      },
      landParcels: {
        'SD6843-9485': {
          size: {
            value: 0.1447,
            unit: 'ha'
          },
          actionsObj: {
            CMOR1: {
              value: '0.1447',
              unit: 'ha'
            },
            UPL1: {
              value: '0.1447',
              unit: 'ha'
            }
          }
        },
        'SD6843-9381': {
          size: {
            value: 0.3822,
            unit: 'ha'
          },
          actionsObj: {
            UPL2: {
              value: '0.0792',
              unit: 'ha'
            }
          }
        }
      },
      applicant
    }

    const result = stateToLandGrantsGasAnswers(input)

    expect(result.application.agreement).toHaveLength(0)

    expect(result.payments.agreement).toHaveLength(1)
    expect(result.payments.agreement[0].code).toBe('CMOR1')
    expect(result.payments.agreement[0].annualPaymentPence).toBe(27200)

    const paymentAgreementCodes = result.payments.agreement.map((a) => a.code)
    expect(paymentAgreementCodes).not.toContain('UPL1')
    expect(paymentAgreementCodes).not.toContain('UPL2')

    expect(result.application.parcel).toHaveLength(2)
    expect(result.payments.parcel).toHaveLength(2)

    const parcel1Actions = result.application.parcel[0].actions.map((a) => a.code)
    expect(parcel1Actions).toContain('CMOR1')
    expect(parcel1Actions).toContain('UPL1')

    const parcel2Actions = result.application.parcel[1].actions.map((a) => a.code)
    expect(parcel2Actions).toContain('UPL2')
  })
})

describe('stateToLandGrantsGasAnswers - rulesCalculations from validationResult', () => {
  beforeEach(() => {
    configState.set('landGrants.enableSSSIFeature', true)
  })

  afterEach(() => {
    configState.reset()
  })

  it('should build rulesCalculations from validationResult', () => {
    const input = {
      payment,
      landParcels: {},
      validationResult: {
        id: 123,
        message: 'Application validated successfully',
        valid: true,
        actions: []
      }
    }

    const result = stateToLandGrantsGasAnswers(input)

    expect(result.rulesCalculations).toEqual(
      expect.objectContaining({
        id: 123,
        message: 'Application validated successfully',
        valid: true,
        date: expect.any(String)
      })
    )
    expect(result.rulesCalculations.caveats).toBeUndefined()
  })

  it('should extract caveats with metadata', () => {
    const input = {
      payment,
      landParcels: {},
      validationResult: {
        id: 11453,
        message: 'Application validated successfully',
        valid: true,
        actions: [
          {
            actionCode: 'UPL2',
            sheetId: 'SD5649',
            parcelId: '9215',
            hasPassed: true,
            rules: [
              {
                name: 'parcel-has-intersection-with-data-layer-moorland',
                passed: true,
                reason: 'This parcel is majority on the moorland',
                description: 'Is this parcel on the moorland?',
                explanations: [
                  {
                    title: 'moorland check',
                    lines: ['This parcel has a 100% intersection with the moorland layer. The target is 51%.']
                  }
                ]
              },
              {
                name: 'applied-for-total-available-area',
                passed: true,
                reason: 'There is sufficient available area (762.8977 ha) for the applied figure (762.8977 ha)',
                description: 'Has the total available area been applied for?',
                explanations: [
                  {
                    title: 'Total valid land cover',
                    lines: ['The available area was (762.8977 ha) the applicant applied for (762.8977 ha)']
                  }
                ]
              },
              {
                name: 'sssi-consent-required',
                passed: true,
                reason: 'A consent is required from Natural England',
                description: 'Is the site of special scientific interest?',
                explanations: [
                  {
                    title: 'sssi check',
                    lines: ['This parcel has a 99.99% intersection with the sssi layer. The tolerance is 1%.']
                  }
                ],
                caveat: {
                  code: 'ne-consent-required',
                  description: 'A consent is required from Natural England',
                  metadata: {
                    actionCode: 'UPL2',
                    parcelId: '9215',
                    sheetId: 'SD5649',
                    percentageOverlap: 99.99,
                    overlapAreaHectares: 764.1672
                  }
                }
              }
            ]
          }
        ]
      }
    }

    const result = stateToLandGrantsGasAnswers(input)

    expect(result.rulesCalculations.caveats).toHaveLength(1)
    expect(result.rulesCalculations.caveats[0]).toEqual({
      code: 'ne-consent-required',
      description: 'A consent is required from Natural England',
      metadata: {
        actionCode: 'UPL2',
        parcelId: '9215',
        sheetId: 'SD5649',
        percentageOverlap: 99.99,
        overlapAreaHectares: 764.1672
      }
    })
  })

  it('should extract caveats from validationResult actions', () => {
    const input = {
      payment,
      landParcels: {},
      validationResult: {
        id: 123,
        message: 'success',
        valid: true,
        actions: [
          {
            rules: [{ name: 'rule-1', caveat: { code: 'caveat-1' } }]
          }
        ]
      }
    }

    const result = stateToLandGrantsGasAnswers(input)

    expect(result.rulesCalculations.caveats).toEqual([{ code: 'caveat-1' }])
  })

  it('should return undefined rulesCalculations when no validationResult is provided', () => {
    const input = {
      payment,
      landParcels: {}
    }

    const result = stateToLandGrantsGasAnswers(input)

    expect(result.rulesCalculations).toBeUndefined()
  })
})

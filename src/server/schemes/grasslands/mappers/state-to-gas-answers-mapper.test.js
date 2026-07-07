import { transformGrasslandsAnswers } from './state-to-gas-answers-mapper.js'

const landParcels = {
  'SD6364-6615': {
    size: {
      unitFullName: 'hectares',
      unit: 'ha',
      value: 24.7964
    },
    actionsObj: {
      UPL1: {
        description: 'Moderate livestock grazing on moorland: UPL1',
        version: '3.1.0',
        consents: [],
        value: 24.7964,
        unit: 'ha'
      }
    }
  }
}

const baseSubmissionState = {
  referenceNumber: 'GRASSLANDS-123',
  businessDetailsUpToDate: true,
  confirmLandDetailsUpToDate: true,
  selectedParcelId: 'SD6364-6615',
  selectedParcelsDisplay: 'SD6364-6615',
  landParcels
}

const baseRawState = {
  ...baseSubmissionState,
  landParcels
}

describe('transformGrasslandsAnswers', () => {
  it('maps the selected parcel id and action key from rawState to actionCode', () => {
    const result = transformGrasslandsAnswers(baseSubmissionState, baseRawState)

    expect(result.selectedParcelId).toBe('SD6364-6615')
    expect(result.actionCode).toBe('UPL1')
  })

  it('passes through other submission state fields unchanged', () => {
    const result = transformGrasslandsAnswers(baseSubmissionState, baseRawState)

    expect(result.referenceNumber).toBe('GRASSLANDS-123')
    expect(result.businessDetailsUpToDate).toBe(true)
    expect(result.confirmLandDetailsUpToDate).toBe(true)
  })

  it('does not include selectedParcelsDisplay or landParcels in the output', () => {
    const result = transformGrasslandsAnswers(
      {
        ...baseSubmissionState
      },
      baseRawState
    )

    expect(result).not.toHaveProperty('landParcels')
    expect(result).not.toHaveProperty('selectedParcelsDisplay')
  })

  it('does not add actionCode when the selected parcel is absent from rawState', () => {
    const result = transformGrasslandsAnswers(baseSubmissionState, { ...baseRawState, selectedParcelId: 'UNKNOWN' })

    expect(result).not.toHaveProperty('actionCode')
  })

  it('does not add actionCode when the selected parcel has no actions', () => {
    const result = transformGrasslandsAnswers(baseSubmissionState, {
      ...baseRawState,
      landParcels: {
        'SD6364-6615': {
          ...baseRawState.landParcels['SD6364-6615'],
          actionsObj: {}
        }
      }
    })

    expect(result).not.toHaveProperty('actionCode')
  })
})

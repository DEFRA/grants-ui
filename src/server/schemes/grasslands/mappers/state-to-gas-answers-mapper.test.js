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
  it('maps every parcel with its parcelId and actions from rawState', () => {
    const result = transformGrasslandsAnswers(baseSubmissionState, baseRawState)

    expect(result.parcels).toEqual([
      {
        parcelId: 'SD6364-6615',
        actions: [{ actionCode: 'UPL1', value: 24.7964, unit: 'ha' }]
      }
    ])
  })

  it('includes all parcels and all of their actions', () => {
    const rawState = {
      ...baseRawState,
      landParcels: {
        'SD6352-8774': {
          size: { unitFullName: 'hectares', unit: 'ha', value: 11.1006 },
          actionsObj: {
            CLIG3: {
              description: 'Manage grassland with very low nutrient inputs: CLIG3',
              version: '1.0.0',
              consents: [],
              value: 11.1006,
              unit: 'ha'
            },
            CSAM3: {
              description: 'Herbal leys: CSAM3',
              version: '1.0.0',
              consents: [],
              value: '10',
              unit: 'ha'
            }
          }
        },
        'SD6364-6615': {
          size: { unitFullName: 'hectares', unit: 'ha', value: 24.7964 },
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
    }

    const result = transformGrasslandsAnswers(baseSubmissionState, rawState)

    expect(result.parcels).toEqual([
      {
        parcelId: 'SD6352-8774',
        actions: [
          { actionCode: 'CLIG3', value: 11.1006, unit: 'ha' },
          { actionCode: 'CSAM3', value: '10', unit: 'ha' }
        ]
      },
      {
        parcelId: 'SD6364-6615',
        actions: [{ actionCode: 'UPL1', value: 24.7964, unit: 'ha' }]
      }
    ])
  })

  it('passes through other submission state fields unchanged', () => {
    const result = transformGrasslandsAnswers(baseSubmissionState, baseRawState)

    expect(result.referenceNumber).toBe('GRASSLANDS-123')
    expect(result.businessDetailsUpToDate).toBe(true)
    expect(result.confirmLandDetailsUpToDate).toBe(true)
  })

  it('does not include selectedParcelsDisplay, selectedParcelId or landParcels in the output', () => {
    const result = transformGrasslandsAnswers(
      {
        ...baseSubmissionState
      },
      baseRawState
    )

    expect(result).not.toHaveProperty('landParcels')
    expect(result).not.toHaveProperty('selectedParcelsDisplay')
    expect(result).not.toHaveProperty('selectedParcelId')
  })

  it('returns an empty parcels array when rawState has no land parcels', () => {
    const result = transformGrasslandsAnswers(baseSubmissionState, { ...baseRawState, landParcels: undefined })

    expect(result.parcels).toEqual([])
  })

  it('returns a parcel with an empty actions array when the parcel has no actions', () => {
    const result = transformGrasslandsAnswers(baseSubmissionState, {
      ...baseRawState,
      landParcels: {
        'SD6364-6615': {
          ...baseRawState.landParcels['SD6364-6615'],
          actionsObj: {}
        }
      }
    })

    expect(result.parcels).toEqual([{ parcelId: 'SD6364-6615', actions: [] }])
  })
})

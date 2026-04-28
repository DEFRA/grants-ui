import { transformWoodlandAnswers } from './state-to-gas-answers-mapper.js'

const basePayment = {
  agreementTotalPence: 339510,
  agreementLevelItems: {
    1: {
      code: 'PA3',
      description: 'Woodland management plan',
      activePaymentTier: 3,
      quantityInActiveTier: 26.3397,
      activeTierRatePence: 1500,
      activeTierFlatRatePence: 300000,
      quantity: 126.3397,
      agreementTotalPence: 339510,
      unit: 'ha'
    }
  }
}

// The assembled submission state (from relevantState + additionalAnswers + declarationPayload)
const baseSubmissionState = {
  referenceNumber: 'WMP-ABC-123',
  businessDetailsUpToDate: true,
  landParcels: ['SD7560-9193', 'SD5848-9205'],
  totalHectaresForSelectedParcels: 195.246,
  guidanceRead: true
}

// The raw cache state (contains fields not in submissionState)
const baseRawState = {
  ...baseSubmissionState,
  landParcelMetadata: [
    { parcelId: 'SD7560-9193', areaHa: 25.3874 },
    { parcelId: 'SD5848-9205', areaHa: 169.8586 }
  ],
  payment: basePayment
}

describe('transformWoodlandAnswers', () => {
  it('removes referenceNumber from answers', () => {
    const result = transformWoodlandAnswers(baseSubmissionState, baseRawState)
    expect(result).not.toHaveProperty('referenceNumber')
  })

  it('removes the raw landParcels string IDs', () => {
    const result = transformWoodlandAnswers(baseSubmissionState, baseRawState)
    expect(result.landParcels).not.toContain('SD7560-9193')
  })

  it('maps landParcelMetadata from rawState to landParcels', () => {
    const result = transformWoodlandAnswers(baseSubmissionState, baseRawState)
    expect(result.landParcels).toEqual([
      { parcelId: 'SD7560-9193', areaHa: 25.3874 },
      { parcelId: 'SD5848-9205', areaHa: 169.8586 }
    ])
  })

  it('defaults landParcels to empty array when landParcelMetadata is absent in rawState', () => {
    const { landParcelMetadata, ...rawState } = baseRawState
    const result = transformWoodlandAnswers(baseSubmissionState, rawState)
    expect(result.landParcels).toEqual([])
  })

  it('maps payment from rawState to totalAgreementPaymentPence', () => {
    const result = transformWoodlandAnswers(baseSubmissionState, baseRawState)
    expect(result.totalAgreementPaymentPence).toBe(339510)
  })

  it('maps payment agreementLevelItems to payments.agreement', () => {
    const result = transformWoodlandAnswers(baseSubmissionState, baseRawState)
    expect(result.payments).toEqual({
      agreement: [
        {
          code: 'PA3',
          description: 'Woodland management plan',
          activePaymentTier: 3,
          quantityInActiveTier: 26.3397,
          activeTierRatePence: 1500,
          activeTierFlatRatePence: 300000,
          quantity: 126.3397,
          agreementTotalPence: 339510,
          unit: 'ha'
        }
      ]
    })
  })

  it('defaults totalAgreementPaymentPence to 0 when payment is absent in rawState', () => {
    const { payment, ...rawState } = baseRawState
    const result = transformWoodlandAnswers(baseSubmissionState, rawState)
    expect(result.totalAgreementPaymentPence).toBe(0)
  })

  it('defaults payments.agreement to empty array when payment is absent in rawState', () => {
    const { payment, ...rawState } = baseRawState
    const result = transformWoodlandAnswers(baseSubmissionState, rawState)
    expect(result.payments).toEqual({ agreement: [] })
  })

  it('passes through other submission state fields unchanged', () => {
    const result = transformWoodlandAnswers(baseSubmissionState, baseRawState)
    expect(result.businessDetailsUpToDate).toBe(true)
    expect(result.totalHectaresForSelectedParcels).toBe(195.246)
    expect(result.guidanceRead).toBe(true)
  })

  it('does not include landParcelMetadata in the output', () => {
    const result = transformWoodlandAnswers(baseSubmissionState, baseRawState)
    expect(result).not.toHaveProperty('landParcelMetadata')
  })

  it('does not include payment raw object in the output', () => {
    const result = transformWoodlandAnswers(baseSubmissionState, baseRawState)
    expect(result).not.toHaveProperty('payment')
  })
})

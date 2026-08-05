import { describe, it, expect } from 'vitest'
import { buildConfirmLandAndActionsViewModel } from '~/src/server/land-grants/view-models/confirm-land-and-actions.view-model.js'
import { SystemError } from '~/src/server/common/utils/errors/SystemError.js'

const landParcels = {
  'SD1234-5678': {
    actionsObj: {
      CLIG3: { value: '2', unit: 'ha' },
      CSAM3: { value: '4', unit: 'ha' }
    }
  },
  'CD9999-1111': {
    actionsObj: {
      SCR2: { value: '1', unit: 'ha' }
    }
  }
}

const parcelItems = {
  1: {
    code: 'CLIG3',
    description: 'Action description',
    sheetId: 'SD1234',
    parcelId: '5678',
    quantity: 2,
    unit: 'ha',
    annualPaymentPence: 10000
  },
  2: {
    code: 'CSAM3',
    description: 'Action description',
    sheetId: 'SD1234',
    parcelId: '5678',
    quantity: 4,
    unit: 'ha',
    annualPaymentPence: 20000
  },
  3: {
    code: 'SCR2',
    description: 'Action description',
    sheetId: 'CD9999',
    parcelId: '1111',
    quantity: 1,
    unit: 'ha',
    annualPaymentPence: 300
  }
}

const payment = { annualTotalPence: 123400, parcelItems }
const paymentTotal = '£1,234.00'

describe('buildConfirmLandAndActionsViewModel', () => {
  it('groups actions by parcel and preserves API order', () => {
    const model = buildConfirmLandAndActionsViewModel(payment, paymentTotal, landParcels)

    expect(model.parcels).toEqual([
      {
        parcelId: 'SD1234-5678',
        title: 'Land parcel SD1234 5678',
        removeHref: 'remove-parcel?parcelId=SD1234-5678',
        actions: [
          {
            action: 'Action description: CLIG3',
            area: '2 ha',
            yearlyPayment: '£100.00',
            changeHref: 'select-actions-for-land-parcel?parcelId=SD1234-5678',
            removeHref: 'remove-action?parcelId=SD1234-5678&action=CLIG3'
          },
          {
            action: 'Action description: CSAM3',
            area: '4 ha',
            yearlyPayment: '£200.00',
            changeHref: 'select-actions-for-land-parcel?parcelId=SD1234-5678',
            removeHref: 'remove-action?parcelId=SD1234-5678&action=CSAM3'
          }
        ],
        yearlyPayment: '£300.00'
      },
      {
        parcelId: 'CD9999-1111',
        title: 'Land parcel CD9999 1111',
        removeHref: 'remove-parcel?parcelId=CD9999-1111',
        actions: [
          {
            action: 'Action description: SCR2',
            area: '1 ha',
            yearlyPayment: '£3.00',
            changeHref: 'select-actions-for-land-parcel?parcelId=CD9999-1111',
            removeHref: 'remove-action?parcelId=CD9999-1111&action=SCR2'
          }
        ],
        yearlyPayment: '£3.00'
      }
    ])
  })

  it('sets applicationYearlyPayment from paymentTotal, not from summed rows', () => {
    // Rows sum to £303.00 but the application total is the API-derived paymentTotal.
    const model = buildConfirmLandAndActionsViewModel(payment, paymentTotal, landParcels)
    expect(model.applicationYearlyPayment).toBe('£1,234.00')
  })

  it('sums only the parcel-scoped action pence for each parcel total', () => {
    const model = buildConfirmLandAndActionsViewModel(payment, paymentTotal, landParcels)
    expect(model.parcels[0].yearlyPayment).toBe('£300.00')
    expect(model.parcels[1].yearlyPayment).toBe('£3.00')
  })

  it('throws when a returned parcel is not in state (cross-parcel)', () => {
    const badItems = { ...parcelItems, 3: { ...parcelItems[3], sheetId: 'XX0000', parcelId: '9999' } }
    expect(() =>
      buildConfirmLandAndActionsViewModel({ ...payment, parcelItems: badItems }, paymentTotal, landParcels)
    ).toThrow(SystemError)
  })

  it('throws on a duplicate action for a parcel', () => {
    const badItems = { ...parcelItems, 4: { ...parcelItems[1] } }
    const state = {
      'SD1234-5678': { actionsObj: { CLIG3: {}, CSAM3: {} } },
      'CD9999-1111': { actionsObj: { SCR2: {} } }
    }
    expect(() =>
      buildConfirmLandAndActionsViewModel({ ...payment, parcelItems: badItems }, paymentTotal, state)
    ).toThrow(SystemError)
  })

  it('throws when a selected action is missing from the response', () => {
    const { 2: _removed, ...missing } = parcelItems
    expect(() =>
      buildConfirmLandAndActionsViewModel({ ...payment, parcelItems: missing }, paymentTotal, landParcels)
    ).toThrow(SystemError)
  })

  it('throws when the response has an unexpected action', () => {
    const badItems = {
      ...parcelItems,
      4: { ...parcelItems[1], code: 'ZZZ9' }
    }
    expect(() =>
      buildConfirmLandAndActionsViewModel({ ...payment, parcelItems: badItems }, paymentTotal, landParcels)
    ).toThrow(SystemError)
  })

  it('throws on empty state landParcels', () => {
    expect(() => buildConfirmLandAndActionsViewModel(payment, paymentTotal, {})).toThrow(SystemError)
  })

  it('throws on empty response parcelItems', () => {
    expect(() =>
      buildConfirmLandAndActionsViewModel({ annualTotalPence: 0, parcelItems: {} }, paymentTotal, landParcels)
    ).toThrow(SystemError)
  })

  it('throws with reason invalid_payment_response and correct source', () => {
    try {
      buildConfirmLandAndActionsViewModel({ annualTotalPence: 0, parcelItems: {} }, paymentTotal, landParcels)
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(SystemError)
      expect(error.details.source).toBe('buildConfirmLandAndActionsViewModel')
      expect(error.details.reason).toBe('invalid_payment_response')
    }
  })

  it('throws on malformed money fields', () => {
    const badItems = { ...parcelItems, 1: { ...parcelItems[1], annualPaymentPence: 100.5 } }
    expect(() =>
      buildConfirmLandAndActionsViewModel({ ...payment, parcelItems: badItems }, paymentTotal, landParcels)
    ).toThrow(SystemError)

    const negativeItems = { ...parcelItems, 1: { ...parcelItems[1], annualPaymentPence: -1 } }
    expect(() =>
      buildConfirmLandAndActionsViewModel({ ...payment, parcelItems: negativeItems }, paymentTotal, landParcels)
    ).toThrow(SystemError)
  })

  it('throws when annualTotalPence is not a non-negative integer', () => {
    expect(() => buildConfirmLandAndActionsViewModel({ annualTotalPence: -5, parcelItems }, paymentTotal, landParcels)).toThrow(
      SystemError
    )
    expect(() =>
      buildConfirmLandAndActionsViewModel({ annualTotalPence: 1.5, parcelItems }, paymentTotal, landParcels)
    ).toThrow(SystemError)
  })

  it('throws when paymentTotal is empty', () => {
    expect(() => buildConfirmLandAndActionsViewModel(payment, '', landParcels)).toThrow(SystemError)
  })
})

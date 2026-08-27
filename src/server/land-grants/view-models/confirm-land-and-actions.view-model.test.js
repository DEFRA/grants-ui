import { describe, it, expect } from 'vitest'
import { buildConfirmLandAndActionsViewModel } from '~/src/server/land-grants/view-models/confirm-land-and-actions.view-model.js'
import { SystemError } from '~/src/server/common/utils/errors/SystemError.js'

const landParcels = {
  'SD1234-5678': {
    size: { unit: 'ha', value: 12 },
    actionsObj: {
      CLIG3: { value: 2, unit: 'ha' },
      CSAM3: { value: 4, unit: 'ha' }
    }
  },
  'CD9999-1111': {
    size: { unit: 'ha', value: 3 },
    actionsObj: {
      SCR2: { value: 1, unit: 'ha' }
    }
  }
}

const parcelItems = {
  1: {
    code: 'CLIG3',
    description: 'Action description',
    unit: 'ha',
    quantity: 2,
    annualPaymentPence: 1000,
    sheetId: 'SD1234',
    parcelId: '5678'
  },
  2: {
    code: 'CSAM3',
    description: 'Another action',
    unit: 'ha',
    quantity: 4,
    annualPaymentPence: 2000,
    sheetId: 'SD1234',
    parcelId: '5678'
  },
  3: {
    code: 'SCR2',
    description: 'Third action',
    unit: 'ha',
    quantity: 1,
    annualPaymentPence: 300,
    sheetId: 'CD9999',
    parcelId: '1111'
  }
}

const payment = { annualTotalPence: 123400, parcelItems }

describe('buildConfirmLandAndActionsViewModel', () => {
  it('groups actions into a card per parcel', () => {
    const model = buildConfirmLandAndActionsViewModel(payment, landParcels)

    expect(model.parcels).toHaveLength(2)
    expect(model.parcels[0]).toEqual({
      reference: 'SD1234 5678',
      removeHref: 'remove-parcel?parcelId=SD1234-5678',
      addActionsHref: 'select-actions-for-land-parcel?parcelId=SD1234-5678',
      yearlyPayment: '£30.00',
      actions: [
        {
          action: 'Action description (CLIG3)',
          area: '2.0000 ha',
          yearlyPayment: '£10.00',
          changeHref: 'select-actions-for-land-parcel?parcelId=SD1234-5678'
        },
        {
          action: 'Another action (CSAM3)',
          area: '4.0000 ha',
          yearlyPayment: '£20.00',
          changeHref: 'select-actions-for-land-parcel?parcelId=SD1234-5678'
        }
      ]
    })
    expect(model.parcels[1].reference).toBe('CD9999 1111')
    expect(model.parcels[1].actions).toHaveLength(1)
  })

  it('exposes no action-level removeHref, because this page offers only Change', () => {
    const model = buildConfirmLandAndActionsViewModel(payment, landParcels)

    expect(model.parcels[0].actions[0]).not.toHaveProperty('removeHref')
  })

  describe('action requirement text', () => {
    const parcelsWithConsents = (clig3Consents, scr2Consents) => ({
      'SD1234-5678': {
        size: { unit: 'ha', value: 12 },
        actionsObj: {
          CLIG3: { value: 2, unit: 'ha', consents: clig3Consents },
          CSAM3: { value: 4, unit: 'ha' }
        }
      },
      'CD9999-1111': {
        size: { unit: 'ha', value: 3 },
        actionsObj: {
          SCR2: { value: 1, unit: 'ha', consents: scr2Consents }
        }
      }
    })

    const requirementTextsOf = (parcels) =>
      buildConfirmLandAndActionsViewModel(payment, parcels).parcels.map((parcel) =>
        parcel.actions.map((action) => action.requirementText)
      )

    it.each([
      [['sssi'], 'Requires SSSI consent'],
      [['hefer'], 'Requires an SFI HEFER'],
      [['sssi', 'hefer'], 'Requires SSSI consent and an SFI HEFER'],
      [['hefer', 'sssi'], 'Requires SSSI consent and an SFI HEFER']
    ])('renders %j as the hint for that action only', (consents, expected) => {
      expect(requirementTextsOf(parcelsWithConsents(consents))).toEqual([[expected, undefined], [undefined]])
    })

    it('keeps each action on each parcel to its own persisted requirement', () => {
      expect(requirementTextsOf(parcelsWithConsents(['sssi'], ['hefer']))).toEqual([
        ['Requires SSSI consent', undefined],
        ['Requires an SFI HEFER']
      ])
    })

    it.each([
      ['no consents key at all', undefined],
      ['an empty consents array', []],
      ['unknown consent keys', ['unknown']],
      ['a non-array consents value', 'sssi'],
      ['a null consents value', null]
    ])('adds no requirementText for %s', (_name, consents) => {
      const [firstParcel] = buildConfirmLandAndActionsViewModel(payment, parcelsWithConsents(consents)).parcels

      expect(firstParcel.actions[0]).not.toHaveProperty('requirementText')
    })

    it('adds no requirementText when state has no entry for the priced action', () => {
      const model = buildConfirmLandAndActionsViewModel(payment, {
        'SD1234-5678': { size: { unit: 'ha', value: 12 }, actionsObj: {} }
      })

      expect(model.parcels[0].actions[0]).not.toHaveProperty('requirementText')
    })

    it('adds no requirementText when no state was supplied at all', () => {
      const model = buildConfirmLandAndActionsViewModel(payment, undefined)

      expect(model.parcels[0].actions[0]).not.toHaveProperty('requirementText')
    })
  })

  it('orders cards by state selection order, not by parcelItem id order', () => {
    const reversedSelection = {
      'CD9999-1111': landParcels['CD9999-1111'],
      'SD1234-5678': landParcels['SD1234-5678']
    }

    const model = buildConfirmLandAndActionsViewModel(payment, reversedSelection)

    expect(model.parcels.map((parcel) => parcel.reference)).toEqual(['CD9999 1111', 'SD1234 5678'])
  })

  it('takes applicationYearlyPayment from annualTotalPence, not from summed rows', () => {
    const model = buildConfirmLandAndActionsViewModel(payment, landParcels)

    expect(model.applicationYearlyPayment).toBe('£1,234.00')
  })

  it('sums only the parcel-scoped action pence for each parcel total', () => {
    const model = buildConfirmLandAndActionsViewModel(payment, landParcels)

    expect(model.parcels.map((parcel) => parcel.yearlyPayment)).toEqual(['£30.00', '£3.00'])
  })

  it('renders a zero-payment action as £0.00', () => {
    const free = { ...parcelItems[1], annualPaymentPence: 0 }
    const model = buildConfirmLandAndActionsViewModel(
      { annualTotalPence: 0, parcelItems: { 1: free } },
      { 'SD1234-5678': landParcels['SD1234-5678'] }
    )

    expect(model.parcels[0].actions[0].yearlyPayment).toBe('£0.00')
    expect(model.parcels[0].yearlyPayment).toBe('£0.00')
    expect(model.applicationYearlyPayment).toBe('£0.00')
  })

  describe('agreement-level items', () => {
    const contractPayment = {
      annualTotalPence: 36055,
      parcelItems: {
        1: {
          code: 'UPL1',
          description: 'Moderate livestock grazing on moorland',
          unit: 'ha',
          quantity: 1.4869,
          rateInPence: 2000,
          annualPaymentPence: 2973,
          sheetId: 'SD6743',
          parcelId: '8083'
        }
      },
      agreementLevelItems: {
        1: {
          code: 'CMOR1',
          description: 'Assess moorland and produce a written record',
          annualPaymentPence: 27200
        }
      }
    }
    const contractState = {
      'SD6743-8083': {
        size: { unit: 'ha', value: 1.4869 },
        actionsObj: {
          UPL1: { value: 1.4869, unit: 'ha' },
          CMOR1: { value: 1.4869, unit: 'ha' }
        }
      }
    }

    it('does not throw when a selected action is priced at agreement level', () => {
      expect(() => buildConfirmLandAndActionsViewModel(contractPayment, contractState)).not.toThrow()
    })

    it('renders agreement-level items so the application total reconciles', () => {
      const model = buildConfirmLandAndActionsViewModel(contractPayment, contractState)

      expect(model.additionalYearlyPayments).toEqual([
        {
          action: 'Assess moorland and produce a written record (CMOR1)',
          yearlyPayment: '£272.00'
        }
      ])
      expect(model.parcels[0].yearlyPayment).toBe('£29.73')
      expect(model.parcels[0].actions[0].area).toBe('1.4869 ha')
      expect(model.applicationYearlyPayment).toBe('£360.55')
    })

    it('renders a response with no parcelItems at all', () => {
      const agreementOnly = {
        annualTotalPence: 27200,
        parcelItems: {},
        agreementLevelItems: contractPayment.agreementLevelItems
      }

      const model = buildConfirmLandAndActionsViewModel(agreementOnly, contractState)

      expect(model.parcels).toEqual([])
      expect(model.additionalYearlyPayments).toHaveLength(1)
      expect(model.applicationYearlyPayment).toBe('£272.00')
    })

    it('returns an empty list when the response has no agreement-level items', () => {
      const model = buildConfirmLandAndActionsViewModel(payment, landParcels)

      expect(model.additionalYearlyPayments).toEqual([])
    })
  })

  it('does not throw when a selected parcel has no actions yet', () => {
    const withEmptyParcel = {
      ...landParcels,
      'SD1234-9999': { size: { unit: 'ha', value: 1 }, actionsObj: {} }
    }

    const model = buildConfirmLandAndActionsViewModel(payment, withEmptyParcel)

    expect(model.parcels.map((parcel) => parcel.reference)).toEqual(['SD1234 5678', 'CD9999 1111'])
  })

  it('renders a parcel the API priced but state does not list', () => {
    const model = buildConfirmLandAndActionsViewModel(payment, { 'SD1234-5678': landParcels['SD1234-5678'] })

    expect(model.parcels.map((parcel) => parcel.reference)).toContain('CD9999 1111')
  })

  it('renders duplicate action rows rather than failing the page', () => {
    const duplicated = { ...parcelItems, 4: { ...parcelItems[1] } }

    const model = buildConfirmLandAndActionsViewModel({ ...payment, parcelItems: duplicated }, landParcels)

    expect(model.parcels[0].actions).toHaveLength(3)
    expect(model.parcels[0].yearlyPayment).toBe('£40.00')
  })

  it('falls back to the action code when the description is missing', () => {
    const noDescription = { 1: { ...parcelItems[1], description: undefined } }

    const model = buildConfirmLandAndActionsViewModel(
      { annualTotalPence: 1000, parcelItems: noDescription },
      { 'SD1234-5678': landParcels['SD1234-5678'] }
    )

    expect(model.parcels[0].actions[0].action).toBe('CLIG3')
  })

  it('omits missing quantity or unit from the area instead of rendering "undefined"', () => {
    const noArea = { 1: { ...parcelItems[1], quantity: undefined, unit: undefined } }

    const model = buildConfirmLandAndActionsViewModel(
      { annualTotalPence: 1000, parcelItems: noArea },
      { 'SD1234-5678': landParcels['SD1234-5678'] }
    )

    expect(model.parcels[0].actions[0].area).toBe('')
  })

  it('leaves an unexpected non-numeric quantity as received rather than validating it', () => {
    const stringQuantity = { 1: { ...parcelItems[1], quantity: '2' } }

    const model = buildConfirmLandAndActionsViewModel(
      { annualTotalPence: 1000, parcelItems: stringQuantity },
      { 'SD1234-5678': landParcels['SD1234-5678'] }
    )

    expect(model.parcels[0].actions[0].area).toBe('2 ha')
  })

  it('percent-encodes a parcel id used in a query string', () => {
    const model = buildConfirmLandAndActionsViewModel(payment, landParcels)

    expect(model.parcels[0].actions[0].changeHref).toBe('select-actions-for-land-parcel?parcelId=SD1234-5678')
  })

  it('links each parcel card to its own actions page so more actions can be added', () => {
    const model = buildConfirmLandAndActionsViewModel(payment, landParcels)

    expect(model.parcels.map((parcel) => parcel.addActionsHref)).toEqual([
      'select-actions-for-land-parcel?parcelId=SD1234-5678',
      'select-actions-for-land-parcel?parcelId=CD9999-1111'
    ])
  })

  it('builds a card for a parcel the response prices but state does not hold', () => {
    const model = buildConfirmLandAndActionsViewModel(
      { annualTotalPence: 1000, parcelItems: { 1: parcelItems[1] } },
      {}
    )

    expect(model.parcels[0]).toMatchObject({
      reference: 'SD1234 5678',
      removeHref: 'remove-parcel?parcelId=SD1234-5678',
      addActionsHref: 'select-actions-for-land-parcel?parcelId=SD1234-5678',
      yearlyPayment: '£10.00'
    })
  })

  describe('malformed responses', () => {
    it('throws when annualTotalPence is not a non-negative integer', () => {
      for (const annualTotalPence of [undefined, null, -5, 1.5, '1234']) {
        expect(() => buildConfirmLandAndActionsViewModel({ annualTotalPence, parcelItems }, landParcels)).toThrow(
          /annualTotalPence must be a non-negative integer/
        )
      }
    })

    it('throws when a parcel item is missing its code', () => {
      const items = { 1: { ...parcelItems[1], code: '' } }

      expect(() =>
        buildConfirmLandAndActionsViewModel({ annualTotalPence: 1000, parcelItems: items }, landParcels)
      ).toThrow(/parcel item requires non-empty code, sheetId and parcelId/)
    })

    it('throws when a parcel item is missing its sheetId', () => {
      const items = { 1: { ...parcelItems[1], sheetId: '   ' } }

      expect(() =>
        buildConfirmLandAndActionsViewModel({ annualTotalPence: 1000, parcelItems: items }, landParcels)
      ).toThrow(/parcel item requires non-empty code, sheetId and parcelId/)
    })

    it('throws when a parcel item payment is malformed', () => {
      const items = { 1: { ...parcelItems[1], annualPaymentPence: 'free' } }

      expect(() =>
        buildConfirmLandAndActionsViewModel({ annualTotalPence: 1000, parcelItems: items }, landParcels)
      ).toThrow(/annualPaymentPence must be a non-negative integer for action "CLIG3"/)
    })

    it('throws when an agreement-level item payment is malformed', () => {
      const agreementLevelItems = { 1: { code: 'CMOR1', description: 'Assess moorland', annualPaymentPence: null } }

      expect(() => buildConfirmLandAndActionsViewModel({ ...payment, agreementLevelItems }, landParcels)).toThrow(
        /annualPaymentPence must be a non-negative integer for action "CMOR1"/
      )
    })

    it('throws a SystemError carrying the invalid_payment_response reason', () => {
      let caught
      try {
        buildConfirmLandAndActionsViewModel({ annualTotalPence: -1 }, landParcels)
      } catch (err) {
        caught = err
      }

      expect(caught).toBeInstanceOf(SystemError)
      expect(caught.details.source).toBe('buildConfirmLandAndActionsViewModel')
      expect(caught.details.reason).toBe('invalid_payment_response')
    })
  })
})

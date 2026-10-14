import { describe, expect, it } from 'vitest'
import { createComponentRenderer } from '~/src/server/common/test-helpers/component-helpers.js'

const render = createComponentRenderer(import.meta.url, 'landParcelCards')
const parcels = [
  {
    reference: 'SD1234 5678',
    actions: [{ action: 'CLIG3', area: '2.0000 ha', yearlyPayment: '£10.00' }],
    yearlyPayment: '£10.00'
  },
  {
    reference: 'CD9999 1111',
    actions: [
      {
        action: 'A longer action description (CSAM3)',
        area: '1234.0000 ha',
        yearlyPayment: '£123,456.00',
        requirementText: 'SSSI consent and HEFER required'
      },
      { action: 'Another action (SCR2)', area: '', yearlyPayment: '£3.00' }
    ],
    yearlyPayment: '£123,459.00'
  }
]

describe('land parcel table columns', () => {
  it.each([false, true])('uses the same column definitions for every parcel (readOnly: %s)', (readOnly) => {
    const $ = render({ parcels, readOnly })
    const tables = $('.land-parcel-summary__table')
    expect(tables).toHaveLength(2)

    for (const table of tables.toArray()) {
      const columns = $(table).find('colgroup col')
      expect(columns.map((_, column) => $(column).attr('class')).get()).toEqual([
        `land-parcel-summary__column--action${readOnly ? ' land-parcel-summary__column--action-read-only' : ''}`,
        'land-parcel-summary__column--quantity',
        'land-parcel-summary__column--payment',
        ...(readOnly ? [] : ['land-parcel-summary__column--change'])
      ])
      expect($(table).find('thead th')).toHaveLength(columns.length)
      for (const row of $(table).find('tbody tr').toArray()) {
        expect($(row).children('th, td')).toHaveLength(columns.length)
        expect($(row).children().eq(1).hasClass('govuk-table__cell--numeric')).toBe(true)
        expect($(row).children().eq(2).hasClass('govuk-table__cell--numeric')).toBe(true)
      }
    }
  })
})

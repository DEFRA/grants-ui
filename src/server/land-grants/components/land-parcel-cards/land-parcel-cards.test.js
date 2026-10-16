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
      const container = $(table).parent()
      expect(container.hasClass('land-parcel-summary__table-container')).toBe(true)
      expect(container.attr('role')).toBe('region')
      expect(container.attr('tabindex')).toBe('0')
      expect(container.attr('aria-label')).toBe($(table).find('caption').text().trim())
      const columns = $(table).find('colgroup col')
      expect(columns.toArray().map((column) => $(column).attr('class'))).toEqual([
        undefined,
        'land-parcel-summary__column--quantity',
        'land-parcel-summary__column--payment',
        ...(readOnly ? [] : ['land-parcel-summary__column--change'])
      ])
      expect($(table).find('thead th')).toHaveLength(columns.length)
      expect(
        $(table)
          .find('thead th')
          .map((_, header) => $(header).text().trim())
          .get()
      ).toEqual(['Action', 'Quantity', 'Yearly payment', ...(readOnly ? [] : ['Change'])])
      expect($(table).find('thead th').eq(1).hasClass('govuk-table__header--numeric')).toBe(true)
      expect($(table).find('thead th').eq(2).hasClass('govuk-table__header--numeric')).toBe(true)
      for (const row of $(table).find('tbody tr').toArray()) {
        expect($(row).children('th, td')).toHaveLength(columns.length)
        expect($(row).children().eq(1).hasClass('govuk-table__cell--numeric')).toBe(true)
        expect($(row).children().eq(2).hasClass('govuk-table__cell--numeric')).toBe(true)
      }
      expect($(table).find('tbody a')).toHaveLength(readOnly ? 0 : $(table).find('tbody tr').length - 1)
    }
  })

  it('keeps quantities and payments in their columns for mixed action lengths and an empty quantity', () => {
    const $ = render({ parcels })
    const tables = $('.land-parcel-summary__table')

    for (const [index, parcel] of parcels.entries()) {
      const rows = tables.eq(index).find('tbody tr')
      expect(rows).toHaveLength(parcel.actions.length + 1)

      for (const [actionIndex, action] of parcel.actions.entries()) {
        const cells = rows.eq(actionIndex).children('td')
        expect(cells.eq(0).text().trim()).toBe(action.area)
        expect(cells.eq(1).text().trim()).toBe(action.yearlyPayment)
      }

      const subtotalCells = rows.last().children('td')
      expect(subtotalCells.eq(0).text().trim()).toBe('')
      expect(subtotalCells.eq(1).text().trim()).toBe(parcel.yearlyPayment)
    }
  })
})

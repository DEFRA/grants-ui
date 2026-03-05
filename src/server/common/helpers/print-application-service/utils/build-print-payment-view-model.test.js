import {
  buildPrintPaymentViewModel,
  buildPrintParcelItems,
  buildPrintAdditionalPayments
} from './build-print-payment-view-model.js'

import { MOCK_PAYMENT } from '~/src/__test-fixtures__/mock-payment.js'

vi.mock('~/src/config/nunjucks/filters/filters.js', async () => {
  const { mockFilters } = await import('~/src/__mocks__')
  return mockFilters()
})

describe('buildPrintPaymentViewModel', () => {
  test('returns null when payment is falsy', () => {
    expect(buildPrintPaymentViewModel(null)).toBeNull()
    expect(buildPrintPaymentViewModel(undefined)).toBeNull()
  })

  test('returns view model with total, parcel items and additional payments', () => {
    const result = buildPrintPaymentViewModel(MOCK_PAYMENT)

    expect(result).not.toBeNull()
    expect(result.totalAnnualPayment).toBe('£1500.00')
    expect(result.parcelItems).toHaveLength(2)
    expect(result.additionalPayments).toHaveLength(1)
  })

  test('handles payment with no parcel items or agreement items', () => {
    const result = buildPrintPaymentViewModel({ annualTotalPence: 0 })

    expect(result.totalAnnualPayment).toBe('£0.00')
    expect(result.parcelItems).toEqual([])
    expect(result.additionalPayments).toEqual([])
  })
})

describe('buildPrintParcelItems', () => {
  test('groups items by sheetId/parcelId into 3-column rows', () => {
    const result = buildPrintParcelItems(MOCK_PAYMENT)

    expect(result).toHaveLength(2)
    expect(result[0].cardTitle).toBe('Land parcel ID AB1234 0001')
    expect(result[0].items).toHaveLength(2)
    expect(result[1].cardTitle).toBe('Land parcel ID CD5678 0002')
    expect(result[1].items).toHaveLength(1)

    const firstRow = result[0].items[0]
    expect(firstRow).toHaveLength(3)
    expect(firstRow[0]).toEqual({ text: 'Assess and record soil organic matter: SAM1' })
    expect(firstRow[1]).toEqual({ text: '10.50', format: 'numeric' })
    expect(firstRow[2]).toEqual({ text: '£1000.00', format: 'numeric' })
  })
})

describe('buildPrintAdditionalPayments', () => {
  test('maps agreement level items to 2-column rows', () => {
    const result = buildPrintAdditionalPayments(MOCK_PAYMENT)

    expect(result).toHaveLength(1)
    expect(result[0]).toHaveLength(2)
    expect(result[0][0].text).toBe('Additional payment per agreement per year for Agreement level action: AGR1')
    expect(result[0][1]).toEqual({ text: '£500.00', format: 'numeric' })
  })
})

test.each([
  ['buildPrintParcelItems', buildPrintParcelItems],
  ['buildPrintAdditionalPayments', buildPrintAdditionalPayments]
])('%s returns empty array for empty input', (_name, fn) => {
  expect(fn({})).toEqual([])
})

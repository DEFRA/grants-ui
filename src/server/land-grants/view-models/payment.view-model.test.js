import { describe, it, expect, vi } from 'vitest'
import {
  formatPrice,
  createParcelItemRow,
  buildLandParcelHeaderActions,
  buildLandParcelFooterActions,
  mapPaymentInfoToParcelItems,
  mapAdditionalYearlyPayments
} from './payment.view-model.js'

// Mock the action groups import
vi.mock('../services/land-grants.service.js', () => ({
  actionGroups: [
    { name: 'Group 1', actions: ['SAM1', 'SAM2'] },
    { name: 'Group 2', actions: ['SAM3', 'SAM4'] }
  ]
}))

describe('payment-view-model.mapper', () => {
  describe('formatPrice', () => {
    it('should format price from pence to currency', () => {
      expect(formatPrice(10050)).toBe('£100.50')
    })

    it('should handle zero', () => {
      expect(formatPrice(0)).toBe('£0.00')
    })

    it('should handle large amounts', () => {
      expect(formatPrice(123456789)).toBe('£1,234,567.89')
    })
  })

  describe('createParcelItemRow', () => {
    it('should create row with all columns', () => {
      const data = {
        sheetId: 'AB1234',
        parcelId: '5678',
        code: 'SAM1',
        description: 'Test Action',
        quantity: '10 hectares',
        annualPaymentPence: 10050
      }

      const result = createParcelItemRow(data)

      expect(result).toHaveLength(4)
      expect(result[0].text).toBe('Test Action: SAM1')
      expect(result[1].text).toBe('10 hectares')
      expect(result[2].text).toBe('£100.50')
      expect(result[3].html).toContain('select-actions-for-land-parcel?parcelId=AB1234-5678')
      expect(result[3].html).toContain('remove-action?parcelId=AB1234-5678&action=SAM1')
    })

    it('should include hidden text for accessibility', () => {
      const data = {
        sheetId: 'AB1234',
        parcelId: '5678',
        code: 'SAM1',
        description: 'Test Action',
        quantity: '10 hectares',
        annualPaymentPence: 10050
      }

      const result = createParcelItemRow(data)

      expect(result[3].html).toContain('govuk-visually-hidden')
      expect(result[3].html).toContain('land action SAM1 for parcel AB1234 5678')
    })
  })

  describe('buildLandParcelHeaderActions', () => {
    it('should build header actions with correct href and text', () => {
      const result = buildLandParcelHeaderActions('AB1234', '5678')

      expect(result).toEqual({
        text: 'Remove',
        href: 'remove-parcel?parcelId=AB1234-5678',
        hiddenTextValue: 'all actions for Land Parcel AB1234 5678'
      })
    })
  })

  describe('buildLandParcelFooterActions', () => {
    it('should return add action button when not all groups covered', () => {
      const selectedActions = {
        item1: { sheetId: 'AB1234', parcelId: '5678', code: 'SAM1' }
      }

      const result = buildLandParcelFooterActions(selectedActions, 'AB1234', '5678')

      expect(result).toEqual({
        text: 'Add another action',
        href: 'select-actions-for-land-parcel?parcelId=AB1234-5678',
        hiddenTextValue: 'to Land Parcel AB1234 5678'
      })
    })

    it('should return empty object when all groups have actions', () => {
      const selectedActions = {
        item1: { sheetId: 'AB1234', parcelId: '5678', code: 'SAM1' },
        item2: { sheetId: 'AB1234', parcelId: '5678', code: 'SAM3' }
      }

      const result = buildLandParcelFooterActions(selectedActions, 'AB1234', '5678')

      expect(result).toEqual({})
    })

    it('should only consider actions for the specific parcel', () => {
      const selectedActions = {
        item1: { sheetId: 'AB1234', parcelId: '5678', code: 'SAM1' },
        item2: { sheetId: 'CD9999', parcelId: '1111', code: 'SAM3' }
      }

      const result = buildLandParcelFooterActions(selectedActions, 'AB1234', '5678')

      expect(result.text).toBe('Add another action')
    })
  })

  describe('mapPaymentInfoToParcelItems', () => {
    it('should group items by parcel', () => {
      const paymentInfo = {
        parcelItems: {
          item1: {
            sheetId: 'AB1234',
            parcelId: '5678',
            code: 'SAM1',
            description: 'Action 1',
            quantity: '10 ha',
            annualPaymentPence: 10000
          },
          item2: {
            sheetId: 'AB1234',
            parcelId: '5678',
            code: 'SAM2',
            description: 'Action 2',
            quantity: '5 ha',
            annualPaymentPence: 5000
          },
          item3: {
            sheetId: 'CD9999',
            parcelId: '1111',
            code: 'SAM1',
            description: 'Action 1',
            quantity: '8 ha',
            annualPaymentPence: 8000
          }
        }
      }

      const result = mapPaymentInfoToParcelItems(paymentInfo)

      expect(result).toHaveLength(2)
      expect(result[0].cardTitle).toBe('Land parcel AB1234 5678')
      expect(result[0].items).toHaveLength(2)
      expect(result[1].cardTitle).toBe('Land parcel CD9999 1111')
      expect(result[1].items).toHaveLength(1)
    })

    it('should handle empty payment info', () => {
      const result = mapPaymentInfoToParcelItems({})

      expect(result).toEqual([])
    })

    it('should include header and footer actions', () => {
      const paymentInfo = {
        parcelItems: {
          item1: {
            sheetId: 'AB1234',
            parcelId: '5678',
            code: 'SAM1',
            description: 'Action 1',
            quantity: '10 ha',
            annualPaymentPence: 10000
          }
        }
      }

      const result = mapPaymentInfoToParcelItems(paymentInfo)

      expect(result[0].headerActions).toBeDefined()
      expect(result[0].headerActions.text).toBe('Remove')
      expect(result[0].footerActions).toBeDefined()
    })
  })

  describe('mapAdditionalYearlyPayments', () => {
    it('should map agreement level items', () => {
      const paymentInfo = {
        agreementLevelItems: {
          item1: {
            code: 'SAM5',
            description: 'Additional Action',
            annualPaymentPence: 50000
          }
        }
      }

      const result = mapAdditionalYearlyPayments(paymentInfo)

      expect(result).toHaveLength(1)
      expect(result[0].items).toHaveLength(1)
      expect(result[0].items[0][0].text).toContain('Additional payment per agreement per year')
      expect(result[0].items[0][0].text).toContain('Additional Action: SAM5')
      expect(result[0].items[0][1].html).toContain('£500.00')
    })

    it('should handle empty agreement items', () => {
      const result = mapAdditionalYearlyPayments({})

      expect(result).toEqual([])
    })

    it('should format multiple agreement items', () => {
      const paymentInfo = {
        agreementLevelItems: {
          item1: {
            code: 'SAM5',
            description: 'Action 5',
            annualPaymentPence: 50000
          },
          item2: {
            code: 'SAM6',
            description: 'Action 6',
            annualPaymentPence: 75000
          }
        }
      }

      const result = mapAdditionalYearlyPayments(paymentInfo)

      expect(result).toHaveLength(2)
    })
  })
})

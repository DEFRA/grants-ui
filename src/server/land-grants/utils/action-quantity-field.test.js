import { describe, it, expect } from 'vitest'
import { getActionQuantityFieldName } from './action-quantity-field.js'

describe('action-quantity-field', () => {
  describe('getActionQuantityFieldName', () => {
    it('should build the field name from an action code', () => {
      expect(getActionQuantityFieldName('CSAM3')).toBe('landActionQuantity_CSAM3')
    })

    it('should produce distinct field names for different action codes', () => {
      expect(getActionQuantityFieldName('CSAM3')).not.toBe(getActionQuantityFieldName('UPL2'))
    })
  })
})

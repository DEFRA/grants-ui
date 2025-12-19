import { describe, it, expect } from 'vitest'
import { extractLandActionFields, validateLandActionsSelection } from './land-actions.validator.js'

describe('land-actions.validator', () => {
  describe('extractLandActionFields', () => {
    it('should extract fields with correct prefix', () => {
      const payload = {
        landAction_1: 'CMOR1',
        landAction_2: 'UPL1',
        otherField: 'value'
      }

      const result = extractLandActionFields(payload, 'landAction_')

      expect(result).toEqual(['landAction_1', 'landAction_2'])
    })

    it('should return empty array when no action fields present', () => {
      const payload = {
        otherField: 'value',
        anotherField: 'test'
      }

      const result = extractLandActionFields(payload, 'landAction_')

      expect(result).toEqual([])
    })

    it('should handle empty payload', () => {
      const result = extractLandActionFields({}, 'landAction_')

      expect(result).toEqual([])
    })

    it('should work with different prefixes', () => {
      const payload = {
        action_1: 'VALUE1',
        action_2: 'VALUE2',
        landAction_1: 'OTHER'
      }

      const result = extractLandActionFields(payload, 'action_')

      expect(result).toEqual(['action_1', 'action_2'])
    })

    it('should not match partial prefix', () => {
      const payload = {
        landAction_1: 'VALUE1',
        land_action_2: 'VALUE2' // underscore in different position
      }

      const result = extractLandActionFields(payload, 'landAction_')

      expect(result).toEqual(['landAction_1'])
    })
  })

  describe('validateLandActionsSelection', () => {
    it('should return errors when no actions selected', () => {
      const payload = {}

      const result = validateLandActionsSelection(payload, 'landAction_')

      expect(result).toEqual([{ text: 'Select an action to do on this land parcel', href: '#landAction_1' }])
    })

    it('should return errors when payload has no action fields', () => {
      const payload = { otherField: 'value' }

      const result = validateLandActionsSelection(payload, 'landAction_')

      expect(result).toEqual([{ text: 'Select an action to do on this land parcel', href: '#landAction_1' }])
    })

    it('should return empty errors when actions are selected', () => {
      const payload = { landAction_1: 'CMOR1' }

      const result = validateLandActionsSelection(payload, 'landAction_')

      expect(result).toEqual([])
    })

    it('should return empty errors when multiple actions selected', () => {
      const payload = {
        landAction_1: 'CMOR1',
        landAction_2: 'UPL1',
        landAction_3: 'SAM1'
      }

      const result = validateLandActionsSelection(payload, 'landAction_')

      expect(result).toEqual([])
    })

    it('should use correct href with custom prefix', () => {
      const payload = {}

      const result = validateLandActionsSelection(payload, 'customAction_')

      expect(result[0].href).toBe('#customAction_1')
    })

    it('should ignore fields that do not match prefix', () => {
      const payload = {
        otherField: 'value',
        anotherField: 'test',
        notAnAction: 'data'
      }

      const result = validateLandActionsSelection(payload, 'landAction_')

      expect(result).toEqual([{ text: 'Select an action to do on this land parcel', href: '#landAction_1' }])
    })
  })
})

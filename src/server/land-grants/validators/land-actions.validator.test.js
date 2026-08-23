import { describe, expect, it } from 'vitest'
import {
  extractLandActionFields,
  validateLandActionsSelection,
  validateSelectedActions,
  validateSelectedActionQuantities
} from './land-actions.validator.js'

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

    it.each([
      ['no action fields are present', { otherField: 'value', anotherField: 'test' }],
      ['the payload is empty', {}]
    ])('should return empty array when %s', (_description, payload) => {
      expect(extractLandActionFields(payload, 'landAction_')).toEqual([])
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
    it.each([
      ['the payload is empty', {}],
      ['the payload has a single non-matching field', { otherField: 'value' }],
      ['no field matches the prefix', { otherField: 'value', anotherField: 'test', notAnAction: 'data' }]
    ])('should return errors when %s', (_description, payload) => {
      expect(validateLandActionsSelection(payload, 'landAction_')).toEqual([
        { text: 'Select at least one action', href: '#landAction_1' }
      ])
    })

    it.each([
      ['one action is selected', { landAction_1: 'CMOR1' }],
      ['multiple actions are selected', { landAction_1: 'CMOR1', landAction_2: 'UPL1', landAction_3: 'SAM1' }]
    ])('should return empty errors when %s', (_description, payload) => {
      expect(validateLandActionsSelection(payload, 'landAction_')).toEqual([])
    })

    it('should use correct href with custom prefix', () => {
      const result = validateLandActionsSelection({}, 'customAction_')

      expect(result[0].href).toBe('#customAction_1')
    })
  })

  describe('validateSelectedActions', () => {
    it('should return an error when no action is selected', () => {
      const result = validateSelectedActions({})

      expect(result).toEqual([{ text: 'Select at least one action', href: '#landAction' }])
    })

    it('should return no errors when a single action is selected (payload value is a string)', () => {
      const result = validateSelectedActions({ landAction: 'CMOR1' })

      expect(result).toEqual([])
    })

    it('should return no errors when multiple actions are selected (payload value is an array)', () => {
      const result = validateSelectedActions({ landAction: ['CMOR1', 'UPL1'] })

      expect(result).toEqual([])
    })

    it('should return an error when the field is present but empty', () => {
      const result = validateSelectedActions({ landAction: '' })

      expect(result).toEqual([{ text: 'Select at least one action', href: '#landAction' }])
    })
  })

  describe('validateSelectedActionQuantities', () => {
    const actions = [
      { code: 'CSAM3', description: 'Herbal leys', version: '1', availability: { type: 'partial' } },
      { code: 'CLIG3', description: 'Manage grassland', version: '1' }
    ]

    it.each([
      ['has no submitted quantity', undefined],
      ['is 0', '0']
    ])('should return an error when the selected quantity-required action %s', (_description, quantity) => {
      const payload = { landAction: 'CSAM3', ...(quantity != null && { landActionQuantity_CSAM3: quantity }) }

      const result = validateSelectedActionQuantities(payload, actions)

      expect(result).toEqual([
        { text: 'Enter a quantity for Herbal leys', href: '#landActionQuantity_CSAM3', code: 'CSAM3' }
      ])
    })

    it('should not require a quantity for an action that does not need one, ignoring the unselected one that does', () => {
      const payload = { landAction: 'CLIG3' }

      const result = validateSelectedActionQuantities(payload, actions)

      expect(result).toEqual([])
    })

    it('should return multiple errors for multiple unconfirmed quantity-required actions', () => {
      const withSecondQuantity = [
        ...actions,
        { code: 'UPL8', description: 'Low input', version: '1', availability: { type: 'partial' } }
      ]
      const payload = { landAction: ['CSAM3', 'UPL8'] }

      const result = validateSelectedActionQuantities(payload, withSecondQuantity)

      expect(result).toEqual([
        { text: 'Enter a quantity for Herbal leys', href: '#landActionQuantity_CSAM3', code: 'CSAM3' },
        { text: 'Enter a quantity for Low input', href: '#landActionQuantity_UPL8', code: 'UPL8' }
      ])
    })

    it.each([
      ['more than 4 decimal places', '3.14159'],
      ['more than one decimal point', '14.211.442121'],
      ['not numeric', 'abc'],
      ['negative', '-3.25'],
      ['scientific notation', '1e5']
    ])('should return an error when the submitted quantity is %s', (_description, quantity) => {
      const payload = { landAction: 'CSAM3', landActionQuantity_CSAM3: quantity }

      const result = validateSelectedActionQuantities(payload, actions)

      expect(result).toEqual([
        {
          text: 'Quantity for Herbal leys must be 4 decimal places or fewer',
          href: '#landActionQuantity_CSAM3',
          code: 'CSAM3'
        }
      ])
    })

    it.each([
      ['a valid quantity', '3.25'],
      ['exactly 4 decimal places', '3.1415'],
      ['fewer than 4 decimal places', '3.1'],
      ['a whole number', '3']
    ])('should return no errors when the submitted quantity is %s', (_description, quantity) => {
      const payload = { landAction: 'CSAM3', landActionQuantity_CSAM3: quantity }

      const result = validateSelectedActionQuantities(payload, actions)

      expect(result).toEqual([])
    })
  })
})

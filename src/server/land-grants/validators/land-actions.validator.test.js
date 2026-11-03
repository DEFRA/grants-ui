import { describe, expect, it } from 'vitest'
import {
  extractLandActionFields,
  validateLandActionsSelection,
  validateSelectedActions,
  validateSelectedActionQuantities
} from './land-actions.validator.js'
import { getQuantityErrors, QUANTITY_ERRORS } from '~/src/shared/action-quantity-validation.js'
import { UNIT_COUNT, UNIT_HECTARES, UNIT_SQUARE_METRES } from '~/src/shared/unit-types.js'

const HECTARES_INVALID = QUANTITY_ERRORS[UNIT_HECTARES].INVALID
const HECTARES_MORE_THAN_AVAILABLE = QUANTITY_ERRORS[UNIT_HECTARES].MORE_THAN_AVAILABLE
const SQUARE_METRES_INVALID = QUANTITY_ERRORS[UNIT_SQUARE_METRES].INVALID
const PONDS_INVALID = getQuantityErrors(UNIT_COUNT, 'ponds').INVALID

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
      {
        code: 'CSAM3',
        description: 'Herbal leys',
        version: '1',
        quantityRequired: true,
        availability: { type: 'total', value: 11.22, unit: 'ha' }
      },
      {
        code: 'CLIG3',
        description: 'Manage grassland',
        version: '1',
        quantityRequired: false,
        availability: { type: 'partial' }
      },
      {
        code: 'SCR2',
        description: 'Manage scrub and open habitat mosaics: SCR2',
        version: '1',
        quantityRequired: true,
        availability: { type: 'partial' }
      }
    ]

    it('should not require a quantity for an action that does not need one, ignoring the unselected ones that do', () => {
      const payload = { landAction: 'CLIG3' }

      const result = validateSelectedActionQuantities(payload, actions)

      expect(result).toEqual([])
    })

    it('should return multiple errors for multiple unconfirmed quantity-required actions', () => {
      const withSecondQuantity = [
        ...actions,
        {
          code: 'UPL8',
          description: 'Low input',
          version: '1',
          quantityRequired: true,
          availability: { type: 'partial' }
        }
      ]
      const payload = { landAction: ['CSAM3', 'UPL8'] }

      const result = validateSelectedActionQuantities(payload, withSecondQuantity)

      expect(result).toEqual([
        { text: HECTARES_INVALID, href: '#landActionQuantity_CSAM3', code: 'CSAM3' },
        { text: HECTARES_INVALID, href: '#landActionQuantity_UPL8', code: 'UPL8' }
      ])
    })

    it.each([
      ['is not submitted at all', undefined],
      ['is empty', ''],
      ['is whitespace only', '  '],
      ['has more than 4 decimal places', '3.14159'],
      ['has more than one decimal point', '14.211.442121'],
      ['is not numeric', 'abc'],
      ['is scientific notation', '1e5'],
      ['is 0', '0'],
      ['is negative', '-3.25'],
      ['is negative with more than 4 decimal places', '-3.14159']
    ])('should return the hectares error when the submitted quantity %s', (_description, quantity) => {
      const payload = { landAction: 'CSAM3', ...(quantity != null && { landActionQuantity_CSAM3: quantity }) }

      const result = validateSelectedActionQuantities(payload, actions)

      expect(result).toEqual([{ text: HECTARES_INVALID, href: '#landActionQuantity_CSAM3', code: 'CSAM3' }])
    })

    it('should use the same maximum quantity error as on-blur validation', () => {
      const payload = { landAction: 'CSAM3', landActionQuantity_CSAM3: '0.277' }
      const actionsWithLimitedArea = actions.map((action) =>
        action.code === 'CSAM3' ? { ...action, availability: { ...action.availability, value: 0.276 } } : action
      )

      const result = validateSelectedActionQuantities(payload, actionsWithLimitedArea)

      expect(result).toEqual([{ text: HECTARES_MORE_THAN_AVAILABLE, href: '#landActionQuantity_CSAM3', code: 'CSAM3' }])
    })

    it.each([
      ['a valid quantity', '3.25'],
      ['exactly 4 decimal places', '3.1415'],
      ['fewer than 4 decimal places', '3.1'],
      ['a whole number', '3'],
      ['a bare decimal, normalised upstream', '0.5']
    ])('should return no errors when the submitted quantity is %s', (_description, quantity) => {
      const payload = { landAction: 'CSAM3', landActionQuantity_CSAM3: quantity }

      const result = validateSelectedActionQuantities(payload, actions)

      expect(result).toEqual([])
    })

    // SCR2 requires a quantity like CSAM3, so the rules above already cover it -
    // these pin that they report against SCR2's own field id.
    it('should require a quantity for SCR2', () => {
      const payload = { landAction: 'SCR2' }

      const result = validateSelectedActionQuantities(payload, actions)

      expect(result).toEqual([
        {
          text: HECTARES_INVALID,
          href: '#landActionQuantity_SCR2',
          code: 'SCR2'
        }
      ])
    })

    it('should reject an SCR2 quantity with more than 4 decimal places', () => {
      const payload = { landAction: 'SCR2', landActionQuantity_SCR2: '11.22001' }

      const result = validateSelectedActionQuantities(payload, actions)

      expect(result).toEqual([
        {
          text: HECTARES_INVALID,
          href: '#landActionQuantity_SCR2',
          code: 'SCR2'
        }
      ])
    })

    it.each(['0', '-11', '1.2', '11.22001', 'as', ''])('rejects invalid HEF1 quantity %j on the server', (quantity) => {
      const hef1 = {
        code: 'HEF1',
        description: 'Maintain weatherproof traditional farm or forestry buildings',
        version: '1.1.0',
        quantityRequired: true,
        availability: { unit: 'sqm', value: null }
      }
      expect(
        validateSelectedActionQuantities({ landAction: 'HEF1', landActionQuantity_HEF1: quantity }, [hef1])
      ).toEqual([{ text: SQUARE_METRES_INVALID, href: '#landActionQuantity_HEF1', code: 'HEF1' }])
    })

    it.each([
      ['a fraction', '4.5', [{ text: PONDS_INVALID, href: '#landActionQuantity_COUNT', code: 'COUNT' }]],
      ['a positive integer', '4', []]
    ])('validates count quantities when the unit requires whole numbers: %s', (_description, quantity, expected) => {
      const countAction = {
        code: 'COUNT',
        description: 'Count action',
        version: '1.0.0',
        quantityRequired: true,
        availability: { unit: 'count', value: null },
        displayUnitPlural: 'ponds'
      }

      expect(
        validateSelectedActionQuantities({ landAction: 'COUNT', landActionQuantity_COUNT: quantity }, [countAction])
      ).toEqual(expected)
    })
  })
})

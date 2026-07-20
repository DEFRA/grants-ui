import { describe, it, expect } from 'vitest'
import { getSelectedActionCodes, SELECTED_ACTIONS_FIELD_NAME } from './selected-actions-field.js'

describe('selected-actions-field', () => {
  describe('SELECTED_ACTIONS_FIELD_NAME', () => {
    it('should be the shared checkbox field name', () => {
      expect(SELECTED_ACTIONS_FIELD_NAME).toBe('landAction')
    })
  })

  describe('getSelectedActionCodes', () => {
    it('should return an empty array when the field is absent', () => {
      expect(getSelectedActionCodes({})).toEqual([])
    })

    it('should return an empty array when payload is null or undefined', () => {
      expect(getSelectedActionCodes(null)).toEqual([])
      expect(getSelectedActionCodes(undefined)).toEqual([])
    })

    it('should return an empty array when the field is an empty string', () => {
      expect(getSelectedActionCodes({ landAction: '' })).toEqual([])
    })

    // Regression: Node's querystring parser (what Hapi/subtext uses for
    // application/x-www-form-urlencoded bodies) returns a plain string when exactly one
    // field with a given name is submitted, and only arrays it when there are two or more.
    // Every consumer of this payload must go through this normaliser rather than assuming
    // either shape, or a single checked checkbox will silently behave differently to two.
    it('should wrap a single submitted value (string) in an array', () => {
      expect(getSelectedActionCodes({ landAction: 'CSAM3' })).toEqual(['CSAM3'])
    })

    it('should pass through multiple submitted values (array) unchanged', () => {
      expect(getSelectedActionCodes({ landAction: ['CSAM3', 'UPL2'] })).toEqual(['CSAM3', 'UPL2'])
    })

    it('should ignore other payload fields', () => {
      expect(getSelectedActionCodes({ landAction: 'CSAM3', action: 'validate', crumb: 'xyz' })).toEqual(['CSAM3'])
    })
  })
})

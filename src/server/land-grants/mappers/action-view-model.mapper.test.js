import { describe, it, expect } from 'vitest'
import { mapActionToViewModel, mapGroupedActionsToViewModel } from './action-view-model.mapper.js'

describe('action-view-model.mapper', () => {
  describe('mapActionToViewModel', () => {
    it('should map action with rate per unit only', () => {
      const action = {
        code: 'SAM1',
        description: 'Test Action 1',
        ratePerUnitGbp: 100.5
      }
      const addedActions = []

      const result = mapActionToViewModel(action, addedActions)

      expect(result).toEqual({
        value: 'SAM1',
        text: 'Test Action 1',
        checked: false,
        hint: {
          html: 'Payment rate per year: <strong>£100.50 per hectare</strong>'
        }
      })
    })

    it('should map action with rate per unit and per agreement', () => {
      const action = {
        code: 'SAM2',
        description: 'Test Action 2',
        ratePerUnitGbp: 75.25,
        ratePerAgreementPerYearGbp: 50
      }
      const addedActions = []

      const result = mapActionToViewModel(action, addedActions)

      expect(result).toEqual({
        value: 'SAM2',
        text: 'Test Action 2',
        checked: false,
        hint: {
          html: 'Payment rate per year: <strong>£75.25 per hectare</strong> and <strong>£50</strong> per agreement'
        }
      })
    })

    it('should mark action as checked when already added', () => {
      const action = {
        code: 'SAM1',
        description: 'Test Action 1',
        ratePerUnitGbp: 100.5
      }
      const addedActions = [{ code: 'SAM1', description: 'Test Action 1' }]

      const result = mapActionToViewModel(action, addedActions)

      expect(result.checked).toBe(true)
    })

    it('should not mark action as checked when not added', () => {
      const action = {
        code: 'SAM1',
        description: 'Test Action 1',
        ratePerUnitGbp: 100.5
      }
      const addedActions = [{ code: 'SAM2', description: 'Test Action 2' }]

      const result = mapActionToViewModel(action, addedActions)

      expect(result.checked).toBe(false)
    })

    it('should handle action with undefined rates', () => {
      const action = {
        code: 'SAM3',
        description: 'Test Action 3'
      }
      const addedActions = []

      const result = mapActionToViewModel(action, addedActions)

      expect(result.hint.html).toBe('Payment rate per year: <strong>£undefined per hectare</strong>')
    })
  })

  describe('mapGroupedActionsToViewModel', () => {
    it('should map grouped actions correctly', () => {
      const groupedActions = [
        {
          name: 'Group 1',
          actions: [
            { code: 'SAM1', description: 'Action 1', ratePerUnitGbp: 100 },
            { code: 'SAM2', description: 'Action 2', ratePerUnitGbp: 200 }
          ]
        },
        {
          name: 'Group 2',
          actions: [{ code: 'SAM3', description: 'Action 3', ratePerUnitGbp: 150 }]
        }
      ]
      const addedActions = [{ code: 'SAM1', description: 'Action 1' }]

      const result = mapGroupedActionsToViewModel(groupedActions, addedActions)

      expect(result).toHaveLength(2)
      expect(result[0].name).toBe('Group 1')
      expect(result[0].actions).toHaveLength(2)
      expect(result[0].actions[0].checked).toBe(true)
      expect(result[0].actions[1].checked).toBe(false)
      expect(result[1].name).toBe('Group 2')
      expect(result[1].actions).toHaveLength(1)
      expect(result[1].actions[0].checked).toBe(false)
    })

    it('should handle empty grouped actions', () => {
      const groupedActions = []
      const addedActions = []

      const result = mapGroupedActionsToViewModel(groupedActions, addedActions)

      expect(result).toEqual([])
    })

    it('should preserve group properties', () => {
      const groupedActions = [
        {
          name: 'Group 1',
          description: 'Group Description',
          extraProp: 'extra',
          actions: [{ code: 'SAM1', description: 'Action 1', ratePerUnitGbp: 100 }]
        }
      ]
      const addedActions = []

      const result = mapGroupedActionsToViewModel(groupedActions, addedActions)

      expect(result[0].name).toBe('Group 1')
      expect(result[0].description).toBe('Group Description')
      expect(result[0].extraProp).toBe('extra')
    })
  })
})

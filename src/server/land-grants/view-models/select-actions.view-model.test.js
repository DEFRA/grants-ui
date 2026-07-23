import { describe, it, expect } from 'vitest'
import { mapActionToViewModel, mapGroupedActionsToViewModel } from './select-actions.view-model.js'

describe('select-actions.view-model', () => {
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
        id: 'landAction-SAM1',
        value: 'SAM1',
        text: 'Test Action 1',
        checked: false,
        hint: {
          html: 'Payment rate per year: £100.50/ha'
        }
      })
    })

    it('should give each item a stable id derived from the action code, for error-anchor links', () => {
      const action = { code: 'CSAM3', description: 'Herbal leys: CSAM3', ratePerUnitGbp: 224 }

      const result = mapActionToViewModel(action, [])

      expect(result.id).toBe('landAction-CSAM3')
    })

    // govuk-frontend's checkboxes template only auto-generates the bare idPrefix
    // ("landAction") when no explicit item.id is set, and only for the first item -
    // every other item falls back to "idPrefix-2", "idPrefix-3", etc. Since every item
    // here gets an explicit id, the "no action selected" error-summary link (which
    // targets the bare "#landAction") only resolves if the first item's id is left as
    // the bare field name to match.
    it('should give the first item the bare field name as its id, matching the "no selection" error anchor', () => {
      const action = { code: 'CSAM3', description: 'Herbal leys: CSAM3', ratePerUnitGbp: 224 }

      const result = mapActionToViewModel(action, [], {}, true)

      expect(result.id).toBe('landAction')
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

      expect(result.hint.html).toBe('Payment rate per year: £75.25/ha and <strong>£50</strong> per agreement')
    })

    it('should mark action as checked when already added', () => {
      const action = { code: 'SAM1', description: 'Test Action 1', ratePerUnitGbp: 100.5 }
      const addedActions = [{ code: 'SAM1', description: 'Test Action 1' }]

      const result = mapActionToViewModel(action, addedActions)

      expect(result.checked).toBe(true)
    })

    it('should not mark action as checked when not added', () => {
      const action = { code: 'SAM1', description: 'Test Action 1', ratePerUnitGbp: 100.5 }
      const addedActions = [{ code: 'SAM2', description: 'Test Action 2' }]

      const result = mapActionToViewModel(action, addedActions)

      expect(result.checked).toBe(false)
    })

    it('should not set a conditional when action does not require a quantity', () => {
      const action = { code: 'SAM1', description: 'Test Action 1', ratePerUnitGbp: 100.5 }

      const result = mapActionToViewModel(action, [])

      expect(result.conditional).toBeUndefined()
    })

    it('should set a conditional reveal when action requires a max quantity', () => {
      const action = {
        code: 'CSAM3',
        description: 'Herbal leys: CSAM3',
        requiresMaxQuantity: 18.5673,
        availableArea: { value: 18.5673, unit: 'ha' }
      }

      const result = mapActionToViewModel(action, [])

      expect(result.conditional.html).toContain('landActionQuantity_CSAM3')
    })

    it('should pre-fill the conditional input with the previously added action value', () => {
      const action = {
        code: 'CSAM3',
        description: 'Herbal leys: CSAM3',
        requiresMaxQuantity: 18.5673,
        availableArea: { value: 18.5673, unit: 'ha' }
      }
      const addedActions = [{ code: 'CSAM3', description: 'Herbal leys: CSAM3', value: '3.25' }]

      const result = mapActionToViewModel(action, addedActions)

      expect(result.conditional.html).toContain('value="3.25"')
    })

    it('should show the available area unit as a suffix on the conditional input', () => {
      const action = {
        code: 'CSAM3',
        description: 'Herbal leys: CSAM3',
        requiresMaxQuantity: 10,
        availableArea: { value: 10, unit: 'ha' }
      }

      const result = mapActionToViewModel(action, [])

      expect(result.conditional.html).toContain('govuk-input__suffix')
      expect(result.conditional.html).toContain('>ha<')
    })

    it('should set the max attribute and available-quantity hint on the conditional input', () => {
      const action = {
        code: 'CSAM3',
        description: 'Herbal leys: CSAM3',
        requiresMaxQuantity: 18.5673,
        availableArea: { value: 18.5673, unit: 'ha' }
      }

      const result = mapActionToViewModel(action, [])

      expect(result.conditional.html).toContain('max="18.5673"')
      expect(result.conditional.html).toContain('18.5673 hectares available')
    })

    // Regression: 0 is a valid, real available area and must not be treated as "no quantity
    // required". `!requiresMaxQuantity` and `{% if maxQuantity %}` both silently swallow 0
    // because it's falsy - the fix is an explicit `!= null` / `!= undefined` check throughout.
    it('should still show the conditional, hint and max attribute when requiresMaxQuantity is 0', () => {
      const action = {
        code: 'CSAM3',
        description: 'Herbal leys: CSAM3',
        requiresMaxQuantity: 0,
        availableArea: { value: 0, unit: 'ha' }
      }

      const result = mapActionToViewModel(action, [])

      expect(result.conditional).toBeDefined()
      expect(result.conditional.html).toContain('max="0"')
      expect(result.conditional.html).toContain('0 hectares available')
    })

    it('should render the full unit name in the hint via formatAreaUnit', () => {
      const action = {
        code: 'CSAM3',
        description: 'Herbal leys: CSAM3',
        requiresMaxQuantity: 5,
        availableArea: { value: 5, unit: 'sqm' }
      }

      const result = mapActionToViewModel(action, [])

      expect(result.conditional.html).toContain('5 square metres available')
    })

    it('should not throw and omit the suffix when availableArea/unit is missing', () => {
      const action = {
        code: 'CSAM3',
        description: 'Herbal leys: CSAM3',
        requiresMaxQuantity: 5
      }

      const result = mapActionToViewModel(action, [])

      expect(result.conditional).toBeDefined()
      expect(result.conditional.html).not.toContain('govuk-input__suffix')
    })

    it('should highlight the quantity input with the given error text when this action has a quantity error', () => {
      const action = {
        code: 'CSAM3',
        description: 'Herbal leys: CSAM3',
        requiresMaxQuantity: 5,
        availableArea: { value: 5, unit: 'ha' }
      }

      const result = mapActionToViewModel(action, [], { CSAM3: 'The amount of land must be no more than 5' })

      expect(result.conditional.html).toContain('govuk-input--error')
      expect(result.conditional.html).toContain('The amount of land must be no more than 5')
    })

    it('should not highlight the quantity input when a different action has the error', () => {
      const action = {
        code: 'CSAM3',
        description: 'Herbal leys: CSAM3',
        requiresMaxQuantity: 5,
        availableArea: { value: 5, unit: 'ha' }
      }

      const result = mapActionToViewModel(action, [], { UPL2: 'Some other error' })

      expect(result.conditional.html).not.toContain('govuk-input--error')
    })

    it('should not highlight the quantity input when no quantity errors are given', () => {
      const action = {
        code: 'CSAM3',
        description: 'Herbal leys: CSAM3',
        requiresMaxQuantity: 5,
        availableArea: { value: 5, unit: 'ha' }
      }

      const result = mapActionToViewModel(action, [])

      expect(result.conditional.html).not.toContain('govuk-input--error')
    })
  })

  describe('mapGroupedActionsToViewModel', () => {
    it('should flatten grouped actions into a single list', () => {
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

      const result = mapGroupedActionsToViewModel(groupedActions, [])

      expect(result).toHaveLength(3)
      expect(result.map((item) => item.value)).toEqual(['SAM1', 'SAM2', 'SAM3'])
    })

    it('should give only the first item across all groups the bare field name as its id', () => {
      const groupedActions = [
        {
          name: 'Group 1',
          actions: [{ code: 'SAM1', description: 'Action 1', ratePerUnitGbp: 100 }]
        },
        {
          name: 'Group 2',
          actions: [
            { code: 'SAM2', description: 'Action 2', ratePerUnitGbp: 200 },
            { code: 'SAM3', description: 'Action 3', ratePerUnitGbp: 150 }
          ]
        }
      ]

      const result = mapGroupedActionsToViewModel(groupedActions, [])

      expect(result.map((item) => item.id)).toEqual(['landAction', 'landAction-SAM2', 'landAction-SAM3'])
    })

    it('should handle empty grouped actions', () => {
      expect(mapGroupedActionsToViewModel([], [])).toEqual([])
    })

    it('should mark actions from any group as checked when previously added', () => {
      const groupedActions = [
        {
          name: 'Group 1',
          actions: [{ code: 'SAM1', description: 'Action 1', ratePerUnitGbp: 100 }]
        },
        {
          name: 'Group 2',
          actions: [{ code: 'SAM2', description: 'Action 2', ratePerUnitGbp: 200 }]
        }
      ]
      const addedActions = [{ code: 'SAM2', description: 'Action 2' }]

      const result = mapGroupedActionsToViewModel(groupedActions, addedActions)

      expect(result.find((item) => item.value === 'SAM1').checked).toBe(false)
      expect(result.find((item) => item.value === 'SAM2').checked).toBe(true)
    })

    it('should thread quantityErrorsByCode through to the matching action across groups', () => {
      const groupedActions = [
        {
          name: 'Group 1',
          actions: [
            {
              code: 'CSAM3',
              description: 'Herbal leys: CSAM3',
              requiresMaxQuantity: 5,
              availableArea: { value: 5, unit: 'ha' }
            }
          ]
        },
        {
          name: 'Group 2',
          actions: [{ code: 'SAM2', description: 'Action 2', ratePerUnitGbp: 200 }]
        }
      ]

      const result = mapGroupedActionsToViewModel(groupedActions, [], { CSAM3: 'Too much land' })

      expect(result.find((item) => item.value === 'CSAM3').conditional.html).toContain('govuk-input--error')
    })
  })
})

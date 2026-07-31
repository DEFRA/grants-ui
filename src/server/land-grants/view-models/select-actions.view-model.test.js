import { describe, it, expect, vi } from 'vitest'
import {
  mapActionToViewModel,
  mapActionsToViewModel,
  getPageConsents,
  getChosenAreaFieldsHtml
} from './select-actions.view-model.js'

const configState = vi.hoisted(() => {
  const values = new Map()
  return {
    set(key, value) {
      values.set(key, value)
    },
    reset() {
      values.clear()
    },
    get(key) {
      return values.get(key) ?? false
    }
  }
})

vi.mock('~/src/config/config.js', () => ({
  config: {
    get: (key) => configState.get(key)
  }
}))

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
        html: 'Test Action 1<span class="select-actions-hint">Payment rate per year: £100.50/ha</span>',
        checked: false,
        consents: [],
        attributes: {
          'data-available-unit': undefined,
          'data-total-available-area': undefined
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

      expect(result.html).toBe(
        'Test Action 2<span class="select-actions-hint">Payment rate per year: £75.25/ha and <strong>£50</strong> per agreement</span>'
      )
    })

    it('should show the HEFER requirement text below the payment rate when heferRequired is set', () => {
      configState.set('landGrants.enableHeferFeature', true)
      const action = {
        code: 'GRH12',
        description: 'Manage rough grassland for upland breeding waders',
        ratePerUnitGbp: 203,
        heferRequired: true
      }

      const result = mapActionToViewModel(action, [])
      configState.reset()

      expect(result.html).toBe(
        'Manage rough grassland for upland breeding waders<span class="select-actions-hint">Payment rate per year: £203.00/ha<br>Requires an SFI HEFER</span>'
      )
    })

    it('should not show the HEFER requirement text when the HEFER feature flag is off', () => {
      const action = {
        code: 'GRH12',
        description: 'Manage rough grassland for upland breeding waders',
        ratePerUnitGbp: 203,
        heferRequired: true
      }

      const result = mapActionToViewModel(action, [])

      expect(result.html).toBe(
        'Manage rough grassland for upland breeding waders<span class="select-actions-hint">Payment rate per year: £203.00/ha</span>'
      )
    })

    it('should show the SSSI requirement text below the payment rate when sssiConsentRequired is set', () => {
      configState.set('landGrants.enableSSSIFeature', true)
      const action = {
        code: 'SCR2',
        description: 'Manage scrub and open habitat mosaics',
        ratePerUnitGbp: 350,
        sssiConsentRequired: true
      }

      const result = mapActionToViewModel(action, [])
      configState.reset()

      expect(result.html).toBe(
        'Manage scrub and open habitat mosaics<span class="select-actions-hint">Payment rate per year: £350.00/ha<br>Requires SSSI consent</span>'
      )
    })

    it('should show both requirements when sssiConsentRequired and heferRequired are both set', () => {
      configState.set('landGrants.enableSSSIFeature', true)
      configState.set('landGrants.enableHeferFeature', true)
      const action = {
        code: 'SCR2',
        description: 'Manage scrub and open habitat mosaics',
        ratePerUnitGbp: 350,
        sssiConsentRequired: true,
        heferRequired: true
      }

      const result = mapActionToViewModel(action, [])
      configState.reset()

      expect(result.html).toBe(
        'Manage scrub and open habitat mosaics<span class="select-actions-hint">Payment rate per year: £350.00/ha<br>Requires SSSI consent and an SFI HEFER</span>'
      )
    })

    it('should not show any requirement text when neither flag is set', () => {
      const action = { code: 'SAM1', description: 'Test Action 1', ratePerUnitGbp: 100.5 }

      const result = mapActionToViewModel(action, [])

      expect(result.html).toBe(
        'Test Action 1<span class="select-actions-hint">Payment rate per year: £100.50/ha</span>'
      )
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

    // Stamped per-checkbox (not a single form-wide flag) so the client can keep
    // protecting THIS action's rejected value even after other actions refresh.
    it('should mark a checked action with data-error-on-load when the page is redisplaying a rejected submission', () => {
      const action = { code: 'SAM1', description: 'Test Action 1', ratePerUnitGbp: 100.5 }
      const addedActions = [{ code: 'SAM1', description: 'Test Action 1' }]

      const result = mapActionToViewModel(action, addedActions, {}, false, true)

      expect(result.attributes['data-error-on-load']).toBe('true')
    })

    it('should not mark an unchecked action with data-error-on-load, even when the page has errors', () => {
      const action = { code: 'SAM1', description: 'Test Action 1', ratePerUnitGbp: 100.5 }

      const result = mapActionToViewModel(action, [], {}, false, true)

      expect(result.attributes['data-error-on-load']).toBeUndefined()
    })

    it('should not mark a checked action with data-error-on-load when the page has no errors', () => {
      const action = { code: 'SAM1', description: 'Test Action 1', ratePerUnitGbp: 100.5 }
      const addedActions = [{ code: 'SAM1', description: 'Test Action 1' }]

      const result = mapActionToViewModel(action, addedActions, {}, false, false)

      expect(result.attributes['data-error-on-load']).toBeUndefined()
    })

    it('should not set a conditional when action does not require a quantity', () => {
      const action = { code: 'SAM1', description: 'Test Action 1', ratePerUnitGbp: 100.5 }

      const result = mapActionToViewModel(action, [])

      expect(result.conditional).toBeUndefined()
    })

    // The client-side availability refresh needs the full available area for every
    // action, not just ones with a quantity input - this is the only place it's
    // rendered into the DOM for actions without one.
    it('should render availableArea as data attributes even when the action has no quantity input', () => {
      const action = {
        code: 'SAM1',
        description: 'Test Action 1',
        ratePerUnitGbp: 100.5,
        availableArea: { value: 12.5, unit: 'ha' }
      }

      const result = mapActionToViewModel(action, [])

      expect(result.attributes).toEqual({
        'data-available-unit': 'ha',
        'data-total-available-area': 12.5
      })
    })

    it('should leave the availableArea data attributes undefined when availableArea is missing', () => {
      const action = { code: 'SAM1', description: 'Test Action 1', ratePerUnitGbp: 100.5 }

      const result = mapActionToViewModel(action, [])

      expect(result.attributes).toEqual({
        'data-available-unit': undefined,
        'data-total-available-area': undefined
      })
    })

    it('should render data-total-available-area from staticAvailableArea when present, not the (possibly competed) availableArea', () => {
      const action = {
        code: 'CSAM3',
        description: 'Herbal leys',
        ratePerUnitGbp: 224,
        availableArea: { value: 0, unit: 'ha' },
        staticAvailableArea: { value: 0.3271, unit: 'ha' }
      }

      const result = mapActionToViewModel(action, [])

      expect(result.attributes['data-total-available-area']).toBe(0.3271)
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

  describe('mapActionsToViewModel', () => {
    it('should map a flat list of actions', () => {
      const actions = [
        { code: 'SAM1', description: 'Action 1', ratePerUnitGbp: 100 },
        { code: 'SAM2', description: 'Action 2', ratePerUnitGbp: 200 },
        { code: 'SAM3', description: 'Action 3', ratePerUnitGbp: 150 }
      ]

      const result = mapActionsToViewModel(actions, [])

      expect(result).toHaveLength(3)
      expect(result.map((item) => item.value)).toEqual(['SAM1', 'SAM2', 'SAM3'])
    })

    it('should give only the first item the bare field name as its id', () => {
      const actions = [
        { code: 'SAM1', description: 'Action 1', ratePerUnitGbp: 100 },
        { code: 'SAM2', description: 'Action 2', ratePerUnitGbp: 200 },
        { code: 'SAM3', description: 'Action 3', ratePerUnitGbp: 150 }
      ]

      const result = mapActionsToViewModel(actions, [])

      expect(result.map((item) => item.id)).toEqual(['landAction', 'landAction-SAM2', 'landAction-SAM3'])
    })

    it('should handle an empty actions list', () => {
      expect(mapActionsToViewModel([], [])).toEqual([])
    })

    it('should forward hasErrors to mark every checked action with data-error-on-load', () => {
      const actions = [
        { code: 'SAM1', description: 'Action 1', ratePerUnitGbp: 100 },
        { code: 'SAM2', description: 'Action 2', ratePerUnitGbp: 200 }
      ]
      const addedActions = [{ code: 'SAM1', description: 'Action 1' }]

      const result = mapActionsToViewModel(actions, addedActions, {}, true)

      expect(result.find((item) => item.value === 'SAM1').attributes['data-error-on-load']).toBe('true')
      expect(result.find((item) => item.value === 'SAM2').attributes['data-error-on-load']).toBeUndefined()
    })

    it('should mark a previously added action as checked', () => {
      const actions = [
        { code: 'SAM1', description: 'Action 1', ratePerUnitGbp: 100 },
        { code: 'SAM2', description: 'Action 2', ratePerUnitGbp: 200 }
      ]
      const addedActions = [{ code: 'SAM2', description: 'Action 2' }]

      const result = mapActionsToViewModel(actions, addedActions)

      expect(result.find((item) => item.value === 'SAM1').checked).toBe(false)
      expect(result.find((item) => item.value === 'SAM2').checked).toBe(true)
    })

    it('should thread quantityErrorsByCode through to the matching action', () => {
      const actions = [
        {
          code: 'CSAM3',
          description: 'Herbal leys: CSAM3',
          requiresMaxQuantity: 5,
          availableArea: { value: 5, unit: 'ha' }
        },
        { code: 'SAM2', description: 'Action 2', ratePerUnitGbp: 200 }
      ]

      const result = mapActionsToViewModel(actions, [], { CSAM3: 'Too much land' })

      expect(result.find((item) => item.value === 'CSAM3').conditional.html).toContain('govuk-input--error')
    })

    it('should omit an action with 0 available area from the initial render', () => {
      const actions = [
        { code: 'SAM1', description: 'Action 1', ratePerUnitGbp: 100, availableArea: { value: 0, unit: 'ha' } },
        { code: 'SAM2', description: 'Action 2', ratePerUnitGbp: 200, availableArea: { value: 5, unit: 'ha' } }
      ]

      const result = mapActionsToViewModel(actions, [])

      expect(result.map((item) => item.value)).toEqual(['SAM2'])
    })

    it('should not omit an action with a competed 0 availableArea when its staticAvailableArea is non-zero', () => {
      const actions = [
        {
          code: 'CLIG3',
          description: 'Manage grassland',
          ratePerUnitGbp: 151,
          availableArea: { value: 0, unit: 'ha' },
          staticAvailableArea: { value: 0.3271, unit: 'ha' }
        }
      ]

      const result = mapActionsToViewModel(actions, [])

      expect(result.map((item) => item.value)).toEqual(['CLIG3'])
      expect(result[0].checked).toBe(false)
    })

    it('should still render an action with 0 available area when it was already added', () => {
      const actions = [
        { code: 'SAM1', description: 'Action 1', ratePerUnitGbp: 100, availableArea: { value: 0, unit: 'ha' } }
      ]
      const addedActions = [{ code: 'SAM1', description: 'Action 1' }]

      const result = mapActionsToViewModel(actions, addedActions)

      expect(result.map((item) => item.value)).toEqual(['SAM1'])
      expect(result[0].checked).toBe(true)
    })

    it('should not omit an action with no availableArea at all', () => {
      const actions = [{ code: 'SAM1', description: 'Action 1', ratePerUnitGbp: 100 }]

      const result = mapActionsToViewModel(actions, [])

      expect(result.map((item) => item.value)).toEqual(['SAM1'])
    })

    it('should assign the bare field name id to the first visible item, skipping omitted actions', () => {
      const actions = [
        { code: 'SAM1', description: 'Action 1', ratePerUnitGbp: 100, availableArea: { value: 0, unit: 'ha' } },
        { code: 'SAM2', description: 'Action 2', ratePerUnitGbp: 200, availableArea: { value: 5, unit: 'ha' } }
      ]

      const result = mapActionsToViewModel(actions, [])

      expect(result[0].id).toBe('landAction')
    })
  })

  describe('getPageConsents', () => {
    it('should return an empty array when no action requires SSSI consent or HEFER', () => {
      const actions = [{ code: 'SAM1', description: 'Action 1' }]

      expect(getPageConsents(actions)).toEqual([])
    })

    it('should include sssi when at least one action requires SSSI consent', () => {
      configState.set('landGrants.enableSSSIFeature', true)
      const actions = [
        { code: 'SAM1', description: 'Action 1' },
        { code: 'SCR2', sssiConsentRequired: true }
      ]

      const result = getPageConsents(actions)
      configState.reset()

      expect(result).toEqual(['sssi'])
    })

    it('should include hefer when at least one action requires a HEFER', () => {
      configState.set('landGrants.enableHeferFeature', true)
      const actions = [
        { code: 'SAM1', description: 'Action 1' },
        { code: 'GRH12', heferRequired: true }
      ]

      const result = getPageConsents(actions)
      configState.reset()

      expect(result).toEqual(['hefer'])
    })

    it('should include both keys, without duplicates, when multiple actions require different consents', () => {
      configState.set('landGrants.enableSSSIFeature', true)
      configState.set('landGrants.enableHeferFeature', true)
      const actions = [
        { code: 'SCR2', sssiConsentRequired: true },
        { code: 'GRH12', heferRequired: true },
        { code: 'SCR3', sssiConsentRequired: true }
      ]

      const result = getPageConsents(actions)
      configState.reset()

      expect(result).toEqual(['sssi', 'hefer'])
    })

    it('should return an empty array when the relevant feature flag is off, even if the action has the flag set', () => {
      const actions = [{ code: 'GRH12', heferRequired: true }]

      expect(getPageConsents(actions)).toEqual([])
    })

    it('should return an empty array for an empty actions list', () => {
      expect(getPageConsents([])).toEqual([])
    })
  })

  describe('getChosenAreaFieldsHtml', () => {
    it('should render a hidden field for a non-quantity action', () => {
      const actions = [{ code: 'CMOR1', description: 'Moorland record' }]

      const html = getChosenAreaFieldsHtml(actions, [])

      expect(html).toContain('type="hidden"')
      expect(html).toContain('id="landActionQuantity_CMOR1"')
      expect(html).toContain('name="landActionQuantity_CMOR1"')
    })

    it('should skip a quantity-required action', () => {
      const actions = [{ code: 'CSAM3', description: 'Herbal leys', requiresMaxQuantity: 0.3271 }]

      const html = getChosenAreaFieldsHtml(actions, [])

      expect(html).toBe('')
    })

    it('should pre-fill the value from a saved non-quantity action', () => {
      const actions = [{ code: 'CMOR1', description: 'Moorland record' }]
      const addedActions = [{ code: 'CMOR1', description: 'Moorland record', value: 1.3008 }]

      const html = getChosenAreaFieldsHtml(actions, addedActions)

      expect(html).toContain('value="1.3008"')
    })

    it('should default to 0 when there is no saved chosen area', () => {
      const actions = [{ code: 'CMOR1', description: 'Moorland record' }]

      const html = getChosenAreaFieldsHtml(actions, [])

      expect(html).toContain('value="0"')
    })
  })
})

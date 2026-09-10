import { describe, it, expect, vi, afterEach } from 'vitest'
import { configState } from '~/src/__mocks__/config-mocks.js'
import {
  mapActionToViewModel,
  mapActionsToViewModel,
  getChosenAreaFieldsHtml,
  getParcelSummaryList
} from './select-actions.view-model.js'

vi.mock('~/src/config/config.js', async () => {
  const { mockConfigWithState } = await import('~/src/__mocks__/config-mocks.js')
  return mockConfigWithState({ fallback: false })
})

describe('select-actions.view-model', () => {
  afterEach(() => {
    configState.reset()
  })
  const sam1 = (extra) => ({ code: 'SAM1', description: 'Test Action 1', ratePerUnitGbp: 100.5, ...extra })
  const csam3 = (availability) => ({
    code: 'CSAM3',
    description: 'Herbal leys: CSAM3',
    quantityRequired: true,
    availability: { ...availability, type: 'partial' }
  })

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
        html: 'Test Action 1<span class="select-actions-hint">Payment rate per year: £100.50/ha<span class="select-actions-guidance">This action will use all the available area on this land parcel.</span></span>',
        checked: false,
        consents: [],
        attributes: {
          'data-available-unit': undefined,
          'data-total-available-area': undefined
        }
      })
    })

    it('should render just the description with no guidance link when no guidance URL is set', () => {
      const result = mapActionToViewModel(sam1(), [])

      expect(result.html).toContain('Test Action 1')
      expect(result.html).not.toContain('<a')
    })

    it('should append a read guidance link pointing at the guidance URL when one is set', () => {
      const action = {
        code: 'CLIG3',
        description: 'Manage grassland: CLIG3',
        ratePerUnitGbp: 100.5,
        guidanceUrl: 'https://www.gov.uk/find-funding-for-land-or-farms/clig3'
      }

      const result = mapActionToViewModel(action, [])

      expect(result.html).toContain('href="https://www.gov.uk/find-funding-for-land-or-farms/clig3"')
      expect(result.html).toContain('read guidance')
      expect(result.html).toContain('target="_blank"')
      expect(result.html).toContain('rel="noopener noreferrer"')
    })

    it('should escape the description and guidance URL in the label to avoid breaking the markup', () => {
      const action = {
        code: 'CLIG3',
        description: 'Hedges & <ditches>',
        ratePerUnitGbp: 100.5,
        guidanceUrl: 'https://www.gov.uk/guidance?a=1&b=2'
      }

      const result = mapActionToViewModel(action, [])

      expect(result.html).toContain('Hedges &amp; &lt;ditches&gt;')
      expect(result.html).toContain('href="https://www.gov.uk/guidance?a=1&amp;b=2"')
    })

    it('should not mutate the input action when building the label', () => {
      const action = { code: 'SAM1', description: 'Test Action 1', ratePerUnitGbp: 100.5 }

      mapActionToViewModel(action, [])

      expect(action).toEqual({ code: 'SAM1', description: 'Test Action 1', ratePerUnitGbp: 100.5 })
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
        'Test Action 2<span class="select-actions-hint">Payment rate per year: £75.25/ha and <strong>£50</strong> per agreement<span class="select-actions-guidance">This action will use all the available area on this land parcel.</span></span>'
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
        'Manage rough grassland for upland breeding waders<span class="select-actions-hint">Payment rate per year: £203.00/ha<br>Requires an SFI HEFER<span class="select-actions-guidance">This action will use all the available area on this land parcel.</span></span>'
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
        'Manage rough grassland for upland breeding waders<span class="select-actions-hint">Payment rate per year: £203.00/ha<span class="select-actions-guidance">This action will use all the available area on this land parcel.</span></span>'
      )
    })

    it('should show the SSSI requirement text below the payment rate when sssiConsentRequired is set', () => {
      configState.set('landGrants.enableSSSIFeature', true)
      const action = {
        code: 'CLIG3',
        description: 'Manage grassland with very low nutrient inputs',
        ratePerUnitGbp: 151,
        sssiConsentRequired: true
      }

      const result = mapActionToViewModel(action, [])
      configState.reset()

      expect(result.html).toBe(
        'Manage grassland with very low nutrient inputs<span class="select-actions-hint">Payment rate per year: £151.00/ha<br>Requires SSSI consent<span class="select-actions-guidance">This action will use all the available area on this land parcel.</span></span>'
      )
    })

    it('should show both requirements when sssiConsentRequired and heferRequired are both set', () => {
      configState.set('landGrants.enableSSSIFeature', true)
      configState.set('landGrants.enableHeferFeature', true)
      const action = {
        code: 'CLIG3',
        description: 'Manage grassland with very low nutrient inputs',
        ratePerUnitGbp: 151,
        sssiConsentRequired: true,
        heferRequired: true
      }

      const result = mapActionToViewModel(action, [])
      configState.reset()

      expect(result.html).toBe(
        'Manage grassland with very low nutrient inputs<span class="select-actions-hint">Payment rate per year: £151.00/ha<br>Requires SSSI consent and an SFI HEFER<span class="select-actions-guidance">This action will use all the available area on this land parcel.</span></span>'
      )
    })

    it.each([
      ['SAM1', true],
      ['SAM2', false]
    ])('should mark action as checked only when it is in addedActions (%s)', (addedCode, expected) => {
      const result = mapActionToViewModel(sam1(), [{ code: addedCode, description: 'Test Action' }])

      expect(result.checked).toBe(expected)
    })

    // Stamped per-checkbox (not a single form-wide flag) so the client can keep
    // protecting THIS action's rejected value even after other actions refresh.
    it.each([
      [true, true, 'true'],
      [false, true, undefined],
      [true, false, undefined]
    ])(
      'should stamp data-error-on-load only when checked (%s) and the page has errors (%s)',
      (checked, hasErrors, expected) => {
        const addedActions = checked ? [{ code: 'SAM1', description: 'Test Action 1' }] : []

        const result = mapActionToViewModel(sam1(), addedActions, {}, false, hasErrors)

        expect(result.attributes['data-error-on-load']).toBe(expected)
      }
    )

    // The client-side availability refresh needs the full available area for every
    // action, not just ones with a quantity input - this is the only place it's
    // rendered into the DOM for actions without one.
    it('should render availability as data attributes even when the action has no quantity input', () => {
      const action = {
        code: 'SAM1',
        description: 'Test Action 1',
        ratePerUnitGbp: 100.5,
        quantityRequired: false,
        availability: { value: 12.5, unit: 'ha' }
      }

      const result = mapActionToViewModel(action, [])

      expect(result.attributes).toEqual({
        'data-available-unit': 'ha',
        'data-total-available-area': 12.5
      })
    })

    // Kept in sync live by the client, so it needs a
    // stable id matching getActionQuantityFieldName - same pattern the
    // quantity-input's own hint uses.
    it('should show an availability hint for a non-quantity action, with an id the client can find and update live', () => {
      const action = {
        code: 'CLIG3',
        description: 'Manage grassland with very low nutrient inputs',
        ratePerUnitGbp: 151,
        quantityRequired: false,
        availability: { value: 12.5, unit: 'ha' }
      }

      const result = mapActionToViewModel(action, [])

      expect(result.html).toContain('<span id="landActionQuantity_CLIG3-hint">12.5000 hectares available</span>')
    })

    it('should show the availability in the checkbox hint for a quantity-required action, not inside its conditional', () => {
      const action = {
        code: 'UPL2',
        description: 'Heavy livestock grazing on moorland',
        ratePerUnitGbp: 45,
        quantityRequired: true,
        availability: { value: 3, unit: 'ha', type: 'partial' }
      }

      const result = mapActionToViewModel(action, [])

      expect(result.html).toContain('<span id="landActionQuantity_UPL2-hint">3 hectares available</span>')
      expect(result.conditional.html).not.toContain('landActionQuantity_UPL2-hint">')
    })

    it('should put the availability directly after the payment rate in the checkbox hint', () => {
      const result = mapActionToViewModel({ ...csam3({ value: 2.2822, unit: 'ha' }), ratePerUnitGbp: 45 }, [])

      expect(result.html).toContain('Payment rate per year: £45.00/ha')
      expect(result.html).toContain('<span id="landActionQuantity_CSAM3-hint">2.2822 hectares available</span>')
    })

    it('should show the available-area guidance for a non-quantity (total) action', () => {
      const result = mapActionToViewModel(
        {
          code: 'CLIG3',
          description: 'Manage grassland with very low nutrient inputs: CLIG3',
          ratePerUnitGbp: 151,
          quantityRequired: false,
          availability: { value: 31.89, unit: 'ha', type: 'total' }
        },
        []
      )

      expect(result.html).toContain('This action will use all the available area on this land parcel.')
    })
    it('uses quantityRequired rather than availability type or unit to render the quantity input', () => {
      const quantityAction = {
        code: 'QTY1',
        description: 'Quantity action',
        ratePerUnitGbp: 10,
        quantityRequired: true,
        availability: { value: 4, unit: 'ha', type: 'total' }
      }
      const wholeAreaAction = {
        code: 'WHOLE1',
        description: 'Whole area action',
        ratePerUnitGbp: 10,
        quantityRequired: false,
        availability: { value: 4, unit: 'sqm', type: 'partial' }
      }

      const quantityResult = mapActionToViewModel(quantityAction, [])
      const wholeAreaResult = mapActionToViewModel(wholeAreaAction, [])

      expect(quantityResult.conditional.html).toContain('id="landActionQuantity_QTY1"')
      expect(wholeAreaResult.conditional?.html ?? '').not.toContain('id="landActionQuantity_WHOLE1"')
    })

    it('should not show the available-area guidance for a quantity-required action', () => {
      const result = mapActionToViewModel(csam3({ value: 3, unit: 'ha' }), [])

      expect(result.html).not.toContain('This action will use all the available area on this land parcel.')
    })

    it('should show what a selected total action claimed in its panel, and what that leaves in its hint', () => {
      const action = {
        code: 'CLIG3',
        description: 'Manage grassland with very low nutrient inputs: CLIG3',
        ratePerUnitGbp: 151,
        quantityRequired: false,
        availability: { value: 0, unit: 'ha', type: 'total' },
        staticAvailability: { value: 31.89, unit: 'ha', type: 'total' }
      }

      const result = mapActionToViewModel(action, [{ code: 'CLIG3', description: 'CLIG3', value: 31.89 }])

      expect(result.html).toContain('<span id="landActionQuantity_CLIG3-hint">0.0000 hectares available</span>')
      expect(result.conditional.html).toContain('Quantity')
      expect(result.conditional.html).toContain('id="landActionChosenArea_CLIG3">31.8900 hectares</p>')
    })

    it('should report the leftover headroom as available when a selected total action did not take it all', () => {
      const action = {
        code: 'CLIG3',
        description: 'Manage grassland with very low nutrient inputs: CLIG3',
        ratePerUnitGbp: 151,
        quantityRequired: false,
        availability: { value: 2.5, unit: 'ha', type: 'total' }
      }

      const result = mapActionToViewModel(action, [{ code: 'CLIG3', description: 'CLIG3', value: 9.5 }])

      expect(result.html).toContain('2.5000 hectares available')
      expect(result.conditional.html).toContain('id="landActionChosenArea_CLIG3">9.5000 hectares</p>')
    })

    it('should show what an unselected total action would claim in its panel', () => {
      const action = {
        code: 'CLIG3',
        description: 'Manage grassland with very low nutrient inputs: CLIG3',
        ratePerUnitGbp: 151,
        quantityRequired: false,
        availability: { value: 31.89, unit: 'ha', type: 'total' }
      }

      const result = mapActionToViewModel(action, [])

      expect(result.conditional.html).toContain('id="landActionChosenArea_CLIG3">31.8900 hectares</p>')
    })

    it('should render no quantity panel for a total action with no availability restriction at all', () => {
      const action = {
        code: 'CLIG3',
        description: 'Manage grassland with very low nutrient inputs: CLIG3',
        ratePerUnitGbp: 151,
        quantityRequired: false,
        availability: { value: null, unit: 'ha', type: 'total' }
      }

      expect(mapActionToViewModel(action, []).conditional).toBeUndefined()
    })

    it('should render data-total-available-area from staticAvailability when present, not the (possibly competed) availability', () => {
      const action = {
        code: 'CSAM3',
        description: 'Herbal leys',
        ratePerUnitGbp: 224,
        quantityRequired: true,
        availability: { value: 0, unit: 'ha' },
        staticAvailability: { value: 0.3271, unit: 'ha' }
      }

      const result = mapActionToViewModel(action, [])

      expect(result.attributes['data-total-available-area']).toBe(0.3271)
    })

    it('should render the conditional input with its field id and max attribute, described by the hint above it', () => {
      const result = mapActionToViewModel(csam3({ value: 18.5673, unit: 'ha' }), [])

      expect(result.conditional.html).toContain('landActionQuantity_CSAM3')
      expect(result.conditional.html).toContain('max="18.5673"')
      expect(result.conditional.html).toContain('aria-describedby="landActionQuantity_CSAM3-hint"')
      expect(result.conditional.html).not.toContain('18.5673 hectares available')
    })

    it('should render no max and no hint anywhere, keeping the unit, when the availability value is null', () => {
      const result = mapActionToViewModel(csam3({ value: null, unit: 'ha' }), [])

      expect(result.conditional.html).toContain('landActionQuantity_CSAM3')
      expect(result.conditional.html).not.toContain('max=')
      expect(result.conditional.html).not.toContain('id="landActionQuantity_CSAM3-hint"')
      expect(result.conditional.html).not.toContain('aria-describedby=')
      expect(result.html).not.toContain('id="landActionQuantity_CSAM3-hint"')
      expect(result.conditional.html).toContain('>ha<')
      expect(result.attributes['data-total-available-area']).toBeUndefined()
      expect(result.attributes['data-available-unit']).toBe('ha')
    })
    it('should render an unrestricted quantity input for a square-metre action without unrelated warnings or fields', () => {
      configState.set('landGrants.enableHeferFeature', true)
      const action = {
        code: 'HEF1',
        description: 'Maintain weatherproof traditional farm or forestry buildings: HEF1',
        ratePerUnitGbp: 5,
        quantityRequired: true,
        availability: { value: null, unit: 'sqm' },
        heferRequired: true,
        guidanceUrl:
          'https://www.gov.uk/find-funding-for-land-or-farms/hef1-maintain-weatherproof-traditional-farm-or-forestry-buildings'
      }

      const result = mapActionToViewModel(action, [])

      expect(result.conditional.html).toContain('id="landActionQuantity_HEF1"')
      expect(result.conditional.html).toContain('inputmode="numeric"')
      expect(result.conditional.html).toContain('>square metres<')
      expect(result.conditional.html).not.toContain('max=')
      expect(result.conditional.html).not.toContain('landActionQuantity_HEF1-hint')
      expect(result.conditional.html).not.toContain('aria-describedby=')
      expect(result.html).not.toContain('id="landActionQuantity_HEF1-hint"')
      expect(result.html).not.toContain('SSSI')
      expect(result.html).toContain('Payment rate per year: £5.00/sqm')
      expect(result.html).toContain('Requires an SFI HEFER')
      expect(result.html).toContain(
        'href="https://www.gov.uk/find-funding-for-land-or-farms/hef1-maintain-weatherproof-traditional-farm-or-forestry-buildings"'
      )
      expect(getChosenAreaFieldsHtml([action], [])).toBe('')
    })

    it('should render an unrestricted numeric quantity input for a count action without a hidden field', () => {
      const action = {
        code: 'WBD1',
        description: 'Countable action',
        ratePerUnitGbp: 5,
        quantityRequired: true,
        availability: { value: null, unit: 'count' }
      }

      const result = mapActionToViewModel(action, [])

      expect(result.conditional.html).toContain('id="landActionQuantity_WBD1"')
      expect(result.conditional.html).toContain('inputmode="numeric"')
      expect(getChosenAreaFieldsHtml([action], [])).toBe('')
    })

    it('should not render a "null available" hint for a non-quantity action with no limit', () => {
      const action = {
        code: 'CLIG3',
        ratePerUnitGbp: 12,
        quantityRequired: false,
        availability: { value: null, unit: 'ha' }
      }

      const result = mapActionToViewModel(action, [])

      expect(result.html).not.toContain('landActionQuantity_CLIG3-hint')
      expect(result.html).not.toContain('null')
      expect(result.conditional).toBeUndefined()
    })

    it('should keep an action with a null availability value visible on initial load', () => {
      const [item] = mapActionsToViewModel([csam3({ value: null, unit: 'ha' })], [])

      expect(item.value).toBe('CSAM3')
    })

    it('should pre-fill the conditional input with the previously added action value', () => {
      const addedActions = [{ code: 'CSAM3', description: 'Herbal leys: CSAM3', value: '3.25' }]

      const result = mapActionToViewModel(csam3({ value: 18.5673, unit: 'ha' }), addedActions)

      expect(result.conditional.html).toContain('value="3.25"')
    })

    it('should show the available area unit as a suffix on the conditional input', () => {
      const result = mapActionToViewModel(csam3({ value: 10, unit: 'ha' }), [])

      expect(result.conditional.html).toContain('govuk-input__suffix')
      expect(result.conditional.html).toContain('>ha<')
    })

    it('should still show the conditional, hint and max attribute when available area is 0', () => {
      const result = mapActionToViewModel(csam3({ value: 0, unit: 'ha' }), [])

      expect(result.conditional).toBeDefined()
      expect(result.conditional.html).toContain('max="0"')
      expect(result.html).toContain('<span id="landActionQuantity_CSAM3-hint">0 hectares available</span>')
    })

    it.each([[null], [undefined]])(
      'should leave the input unbounded, hintless and suffix-less when availability is %j',
      (availability) => {
        const result = mapActionToViewModel(csam3(availability), [])

        expect(result.conditional).toBeDefined()
        expect(result.conditional.html).not.toContain('max=')
        expect(result.conditional.html).not.toContain('available</div>')
        expect(result.conditional.html).not.toContain('govuk-input__suffix')
        expect(result.attributes['data-total-available-area']).toBeUndefined()
      }
    )

    it('should render the full unit name in the hint for a linear quantity action', () => {
      const result = mapActionToViewModel(csam3({ value: 120, unit: 'm' }), [])

      expect(result.html).toContain('120 metres available')
    })

    it('should render a bounded quantity input for a square-metre action', () => {
      const result = mapActionToViewModel(
        {
          code: 'CSAM3',
          description: 'Herbal leys: CSAM3',
          ratePerUnitGbp: 224,
          quantityRequired: true,
          availability: { value: 5, unit: 'sqm' }
        },
        []
      )

      expect(result.conditional.html).toContain('max="5"')
      expect(result.conditional.html).toContain('aria-describedby="landActionQuantity_CSAM3-hint"')
      expect(result.html).toContain('<span id="landActionQuantity_CSAM3-hint">5 square metres available</span>')
    })

    it('should highlight the quantity input with the given error text when this action has a quantity error', () => {
      const result = mapActionToViewModel(csam3({ value: 5, unit: 'ha' }), [], {
        CSAM3: 'The amount of land must be no more than 5'
      })

      expect(result.conditional.html).toContain('govuk-input--error')
      expect(result.conditional.html).toContain('The amount of land must be no more than 5')
    })

    it.each([[{ UPL2: 'Some other error' }], [{}]])(
      'should not highlight the quantity input when this action has no error (%j)',
      (quantityErrorsByCode) => {
        const result = mapActionToViewModel(csam3({ value: 5, unit: 'ha' }), [], quantityErrorsByCode)

        expect(result.conditional.html).not.toContain('govuk-input--error')
      }
    )
  })

  describe('mapActionsToViewModel', () => {
    it('should map a flat list of actions, giving only the first item the bare field name as its id', () => {
      const actions = [
        { code: 'SAM1', description: 'Action 1', ratePerUnitGbp: 100, quantityRequired: false },
        { code: 'SAM2', description: 'Action 2', ratePerUnitGbp: 200, quantityRequired: false },
        { code: 'SAM3', description: 'Action 3', ratePerUnitGbp: 150, quantityRequired: false }
      ]

      const result = mapActionsToViewModel(actions, [])

      expect(result).toHaveLength(3)
      expect(result.map((item) => item.value)).toEqual(['SAM1', 'SAM2', 'SAM3'])
      expect(result.map((item) => item.id)).toEqual(['landAction', 'landAction-SAM2', 'landAction-SAM3'])
    })

    it('should handle an empty actions list', () => {
      expect(mapActionsToViewModel([], [])).toEqual([])
    })

    it('should forward hasErrors to mark every checked action with data-error-on-load', () => {
      const actions = [
        { code: 'SAM1', description: 'Action 1', ratePerUnitGbp: 100, quantityRequired: false },
        { code: 'SAM2', description: 'Action 2', ratePerUnitGbp: 200, quantityRequired: false }
      ]
      const addedActions = [{ code: 'SAM1', description: 'Action 1' }]

      const result = mapActionsToViewModel(actions, addedActions, {}, true)

      expect(result.find((item) => item.value === 'SAM1').attributes['data-error-on-load']).toBe('true')
      expect(result.find((item) => item.value === 'SAM2').attributes['data-error-on-load']).toBeUndefined()
    })

    it('should mark a previously added action as checked', () => {
      const actions = [
        { code: 'SAM1', description: 'Action 1', ratePerUnitGbp: 100, quantityRequired: false },
        { code: 'SAM2', description: 'Action 2', ratePerUnitGbp: 200, quantityRequired: false }
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
          quantityRequired: true,
          availability: { value: 5, unit: 'ha', type: 'partial' }
        },
        { code: 'SAM2', description: 'Action 2', ratePerUnitGbp: 200, quantityRequired: false }
      ]

      const result = mapActionsToViewModel(actions, [], { CSAM3: 'Too much land' })

      expect(result.find((item) => item.value === 'CSAM3').conditional.html).toContain('govuk-input--error')
    })

    it('should omit an action with 0 available area, moving the bare field name id to the first visible item', () => {
      const actions = [
        {
          code: 'SAM1',
          description: 'Action 1',
          ratePerUnitGbp: 100,
          quantityRequired: false,
          availability: { value: 0, unit: 'ha' }
        },
        {
          code: 'SAM2',
          description: 'Action 2',
          ratePerUnitGbp: 200,
          quantityRequired: false,
          availability: { value: 5, unit: 'ha' }
        }
      ]

      const result = mapActionsToViewModel(actions, [])

      expect(result.map((item) => item.value)).toEqual(['SAM2'])
      expect(result[0].id).toBe('landAction')
    })

    it('should not omit an action with a competed 0 availability when its staticAvailability is non-zero', () => {
      const actions = [
        {
          code: 'CLIG3',
          description: 'Manage grassland',
          ratePerUnitGbp: 151,
          quantityRequired: false,
          availability: { value: 0, unit: 'ha' },
          staticAvailability: { value: 0.3271, unit: 'ha' }
        }
      ]

      const result = mapActionsToViewModel(actions, [])

      expect(result.map((item) => item.value)).toEqual(['CLIG3'])
      expect(result[0].checked).toBe(false)
    })

    it('should still render an action with 0 available area when it was already added', () => {
      const actions = [
        {
          code: 'SAM1',
          description: 'Action 1',
          ratePerUnitGbp: 100,
          quantityRequired: false,
          availability: { value: 0, unit: 'ha' }
        }
      ]
      const addedActions = [{ code: 'SAM1', description: 'Action 1' }]

      const result = mapActionsToViewModel(actions, addedActions)

      expect(result.map((item) => item.value)).toEqual(['SAM1'])
      expect(result[0].checked).toBe(true)
    })

    it('should not omit an action with no availability at all', () => {
      const actions = [{ code: 'SAM1', description: 'Action 1', ratePerUnitGbp: 100, quantityRequired: false }]

      const result = mapActionsToViewModel(actions, [])

      expect(result.map((item) => item.value)).toEqual(['SAM1'])
    })
  })

  describe('getChosenAreaFieldsHtml', () => {
    it('should render a hidden field for a non-quantity action, defaulting to 0 with no saved chosen area', () => {
      const actions = [{ code: 'CMOR1', description: 'Moorland record', quantityRequired: false }]

      const html = getChosenAreaFieldsHtml(actions, [])

      expect(html).toContain('type="hidden"')
      expect(html).toContain('id="landActionQuantity_CMOR1"')
      expect(html).toContain('name="landActionQuantity_CMOR1"')
      expect(html).toContain('value="0"')
    })

    it('should skip a quantity-required action', () => {
      const actions = [
        { code: 'CSAM3', description: 'Herbal leys', quantityRequired: true, availability: { type: 'partial' } }
      ]

      const html = getChosenAreaFieldsHtml(actions, [])

      expect(html).toBe('')
    })

    it('should pre-fill the value from a saved non-quantity action', () => {
      const actions = [{ code: 'CMOR1', description: 'Moorland record', quantityRequired: false }]
      const addedActions = [{ code: 'CMOR1', description: 'Moorland record', value: 1.3008 }]

      const html = getChosenAreaFieldsHtml(actions, addedActions)

      expect(html).toContain('value="1.3008"')
    })
  })

  describe('getParcelSummaryList', () => {
    it('should render the parcel reference and total area rows', () => {
      const result = getParcelSummaryList('SO3757', '3185', { value: 45.22, unit: 'ha' })

      expect(result.rows).toEqual([
        { key: { text: 'Parcel reference' }, value: { text: 'SO3757 3185' } },
        { key: { text: 'Total area' }, value: { text: '45.22 hectares' } }
      ])
    })

    it('should render an empty area value when size is missing', () => {
      const result = getParcelSummaryList('SO3757', '3185', undefined)

      expect(result.rows[1]).toEqual({ key: { text: 'Total area' }, value: { text: '' } })
    })
  })
})

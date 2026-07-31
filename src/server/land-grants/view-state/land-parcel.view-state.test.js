import { describe, it, expect, vi } from 'vitest'
import {
  buildNewState,
  addActionsToExistingState,
  addSelectedActionsToState,
  getAddedActionsForStateParcel,
  getAddedActionsFromPayload,
  deleteParcelFromState,
  deleteActionFromState,
  hasLandParcels,
  findActionInfoFromState,
  mergeRecomputedAvailability
} from './land-parcel.view-state.js'

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

describe('land-parcel-state.manager', () => {
  describe('buildNewState', () => {
    it('should add parcel with actions to empty state', () => {
      const state = {}
      const actionsObj = {
        SAM1: { description: 'Action 1', value: '10', unit: 'ha' }
      }
      const parcel = { sheetId: 'AB1234', parcelId: '5678', size: { value: 10, unit: 'ha' } }

      const result = buildNewState(state, actionsObj, parcel)

      expect(result).toEqual({
        landParcels: {
          'AB1234-5678': {
            size: { value: 10, unit: 'ha' },
            actionsObj: {
              SAM1: { description: 'Action 1', value: '10', unit: 'ha' }
            }
          }
        }
      })
    })

    it('should update existing parcel', () => {
      const state = {
        landParcels: {
          'AB1234-5678': {
            size: { value: 10, unit: 'ha' },
            actionsObj: { SAM1: { description: 'Old Action' } }
          }
        }
      }
      const actionsObj = {
        SAM2: { description: 'New Action', value: '5', unit: 'ha' }
      }
      const parcel = { sheetId: 'AB1234', parcelId: '5678', size: { value: 10, unit: 'ha' } }

      const result = buildNewState(state, actionsObj, parcel)

      expect(result.landParcels['AB1234-5678'].actionsObj).toEqual(actionsObj)
    })

    it('should preserve other parcels when adding new one', () => {
      const state = {
        landParcels: {
          'CD9999-1111': {
            size: { value: 5, unit: 'ha' },
            actionsObj: { SAM3: { description: 'Other Parcel Action' } }
          }
        }
      }
      const actionsObj = { SAM1: { description: 'Action 1' } }
      const parcel = { sheetId: 'AB1234', parcelId: '5678', size: { value: 10, unit: 'ha' } }

      const result = buildNewState(state, actionsObj, parcel)

      expect(result.landParcels).toHaveProperty('CD9999-1111')
      expect(result.landParcels).toHaveProperty('AB1234-5678')
    })
  })

  describe('addActionsToExistingState', () => {
    const groupedActions = [
      {
        name: 'Group 1',
        actions: [
          { code: 'SAM1', description: 'Action 1', availableArea: { value: '10', unit: 'ha' } },
          { code: 'SAM2', description: 'Action 2', availableArea: { value: '5', unit: 'ha' } }
        ]
      }
    ]

    it('should create state from payload with selected actions', () => {
      const state = {}
      const payload = {
        landAction_1: 'SAM1',
        landAction_2: 'SAM2',
        otherField: 'value'
      }
      const parcel = { sheetId: 'AB1234', parcelId: '5678', size: { value: 10, unit: 'ha' } }

      const result = addActionsToExistingState(state, payload, 'landAction_', groupedActions, parcel)

      expect(result.landParcels['AB1234-5678'].actionsObj).toEqual({
        SAM1: { description: 'Action 1', consents: [], value: 10, unit: 'ha' },
        SAM2: { description: 'Action 2', consents: [], value: 5, unit: 'ha' }
      })
    })

    it('should populate consents array when action has SSSI consent requirement', () => {
      configState.set('landGrants.enableSSSIFeature', true)

      const actionsWithSSSI = [
        {
          name: 'Moorland Group',
          actions: [
            {
              code: 'CMOR1',
              description: 'Moorland Assessment',
              sssiConsentRequired: true,
              availableArea: { value: '10', unit: 'ha' }
            }
          ]
        }
      ]
      const state = {}
      const payload = { landAction_1: 'CMOR1' }
      const parcel = { sheetId: 'AB1234', parcelId: '5678', size: { value: 10, unit: 'ha' } }

      const result = addActionsToExistingState(state, payload, 'landAction_', actionsWithSSSI, parcel)

      expect(result.landParcels['AB1234-5678'].actionsObj.CMOR1).toEqual({
        description: 'Moorland Assessment',
        consents: ['sssi'],
        value: 10,
        unit: 'ha'
      })

      configState.reset()
    })

    it('should have empty consents array when action does not require any consent', () => {
      const actionsWithoutSSSI = [
        {
          name: 'Group 1',
          actions: [
            {
              code: 'SAM1',
              description: 'Action 1',
              sssiConsentRequired: false,
              availableArea: { value: '10', unit: 'ha' }
            }
          ]
        }
      ]
      const state = {}
      const payload = { landAction_1: 'SAM1' }
      const parcel = { sheetId: 'AB1234', parcelId: '5678', size: { value: 10, unit: 'ha' } }

      const result = addActionsToExistingState(state, payload, 'landAction_', actionsWithoutSSSI, parcel)

      expect(result.landParcels['AB1234-5678'].actionsObj.SAM1).toEqual({
        description: 'Action 1',
        consents: [],
        value: 10,
        unit: 'ha'
      })
    })

    it('should return empty object when no actions selected', () => {
      const state = {}
      const payload = { otherField: 'value' }
      const parcel = { sheetId: 'AB1234', parcelId: '5678' }

      const result = addActionsToExistingState(state, payload, 'landAction_', groupedActions, parcel)

      expect(result).toEqual({})
    })

    it('should handle actions without availableArea', () => {
      const actionsWithoutArea = [
        {
          name: 'Group 1',
          actions: [{ code: 'SAM3', description: 'Action 3' }]
        }
      ]
      const state = {}
      const payload = { landAction_1: 'SAM3' }
      const parcel = { sheetId: 'AB1234', parcelId: '5678' }

      const result = addActionsToExistingState(state, payload, 'landAction_', actionsWithoutArea, parcel)

      expect(result.landParcels['AB1234-5678'].actionsObj.SAM3).toEqual({
        description: 'Action 3',
        consents: [],
        value: 0,
        unit: ''
      })
    })

    it('should ignore invalid action codes', () => {
      const state = {}
      const payload = {
        landAction_1: 'INVALID_CODE',
        landAction_2: 'SAM1'
      }
      const parcel = { sheetId: 'AB1234', parcelId: '5678' }

      const result = addActionsToExistingState(state, payload, 'landAction_', groupedActions, parcel)

      expect(Object.keys(result.landParcels['AB1234-5678'].actionsObj)).toEqual(['SAM1'])
    })

    describe('quantity override for actions with requiresMaxQuantity', () => {
      const groupedActionsWithQuantity = [
        {
          name: 'Group 1',
          actions: [
            {
              code: 'CSAM3',
              description: 'Herbal leys: CSAM3',
              requiresMaxQuantity: 18.5673,
              availableArea: { value: 18.5673, unit: 'ha' }
            }
          ]
        }
      ]

      it('should store the submitted quantity override instead of the full available area', () => {
        const state = {}
        const payload = { landAction_1: 'CSAM3', landActionQuantity_CSAM3: '3.25' }
        const parcel = { sheetId: 'AB1234', parcelId: '5678' }

        const result = addActionsToExistingState(state, payload, 'landAction_', groupedActionsWithQuantity, parcel)

        expect(result.landParcels['AB1234-5678'].actionsObj.CSAM3.value).toBe(3.25)
      })

      it.each([
        ['no quantity override is submitted', { landAction_1: 'CSAM3' }],
        ['the quantity override is an empty string', { landAction_1: 'CSAM3', landActionQuantity_CSAM3: '' }]
      ])('should fall back to the full available area when %s', (_description, payload) => {
        const state = {}
        const parcel = { sheetId: 'AB1234', parcelId: '5678' }

        const result = addActionsToExistingState(state, payload, 'landAction_', groupedActionsWithQuantity, parcel)

        expect(result.landParcels['AB1234-5678'].actionsObj.CSAM3.value).toBe(18.5673)
      })

      it('should ignore a quantity field for an action that does not require one', () => {
        const state = {}
        const payload = { landAction_1: 'SAM1', landActionQuantity_SAM1: '2' }
        const parcel = { sheetId: 'AB1234', parcelId: '5678' }

        const result = addActionsToExistingState(state, payload, 'landAction_', groupedActions, parcel)

        expect(result.landParcels['AB1234-5678'].actionsObj.SAM1.value).toBe(10)
      })

      it('should preserve a genuinely zero available area when no override is submitted', () => {
        const groupedActionsWithZeroArea = [
          {
            name: 'Group 1',
            actions: [
              {
                code: 'CSAM3',
                description: 'Herbal leys: CSAM3',
                requiresMaxQuantity: 0,
                availableArea: { value: 0, unit: 'ha' }
              }
            ]
          }
        ]
        const state = {}
        const payload = { landAction_1: 'CSAM3' }
        const parcel = { sheetId: 'AB1234', parcelId: '5678' }

        const result = addActionsToExistingState(state, payload, 'landAction_', groupedActionsWithZeroArea, parcel)

        expect(result.landParcels['AB1234-5678'].actionsObj.CSAM3.value).toBe(0)
      })

      it('should preserve a genuinely zero quantity override submitted by the user', () => {
        const state = {}
        const payload = { landAction_1: 'CSAM3', landActionQuantity_CSAM3: '0' }
        const parcel = { sheetId: 'AB1234', parcelId: '5678' }

        const result = addActionsToExistingState(state, payload, 'landAction_', groupedActionsWithQuantity, parcel)

        expect(result.landParcels['AB1234-5678'].actionsObj.CSAM3.value).toBe(0)
      })
    })
  })

  describe('addSelectedActionsToState', () => {
    const actions = [
      { code: 'SAM1', description: 'Action 1', availableArea: { value: '10', unit: 'ha' } },
      { code: 'SAM2', description: 'Action 2', availableArea: { value: '5', unit: 'ha' } }
    ]

    it('should create state from a single selected action (payload value is a string)', () => {
      const state = {}
      const payload = { landAction: 'SAM1' }
      const parcel = { sheetId: 'AB1234', parcelId: '5678' }

      const result = addSelectedActionsToState(state, payload, actions, parcel)

      expect(result.landParcels['AB1234-5678'].actionsObj).toEqual({
        SAM1: { description: 'Action 1', consents: [], value: 10, unit: 'ha' }
      })
    })

    it('should create state from multiple selected actions (payload value is an array)', () => {
      const state = {}
      const payload = { landAction: ['SAM1', 'SAM2'] }
      const parcel = { sheetId: 'AB1234', parcelId: '5678' }

      const result = addSelectedActionsToState(state, payload, actions, parcel)

      expect(result.landParcels['AB1234-5678'].actionsObj).toEqual({
        SAM1: { description: 'Action 1', consents: [], value: 10, unit: 'ha' },
        SAM2: { description: 'Action 2', consents: [], value: 5, unit: 'ha' }
      })
    })

    it('should return an empty object when no action is selected', () => {
      const state = {}
      const payload = {}
      const parcel = { sheetId: 'AB1234', parcelId: '5678' }

      const result = addSelectedActionsToState(state, payload, actions, parcel)

      expect(result).toEqual({})
    })

    it('should ignore an invalid action code', () => {
      const state = {}
      const payload = { landAction: ['INVALID_CODE', 'SAM1'] }
      const parcel = { sheetId: 'AB1234', parcelId: '5678' }

      const result = addSelectedActionsToState(state, payload, actions, parcel)

      expect(Object.keys(result.landParcels['AB1234-5678'].actionsObj)).toEqual(['SAM1'])
    })

    it('should store the submitted quantity override for an action that requires one', () => {
      const actionsWithQuantity = [
        {
          code: 'CSAM3',
          description: 'Herbal leys: CSAM3',
          requiresMaxQuantity: 18.5673,
          availableArea: { value: 18.5673, unit: 'ha' }
        }
      ]
      const state = {}
      const payload = { landAction: 'CSAM3', landActionQuantity_CSAM3: '3.25' }
      const parcel = { sheetId: 'AB1234', parcelId: '5678' }

      const result = addSelectedActionsToState(state, payload, actionsWithQuantity, parcel)

      expect(result.landParcels['AB1234-5678'].actionsObj.CSAM3.value).toBe(3.25)
    })

    // Checking a quantity-required action's box alone (no quantity typed yet)
    // is not a confirmed selection - it must not be saved to state on submit,
    // matching the live-refresh page behaviour of treating it as unselected.
    it('should not save a quantity-required action that was checked but never given a quantity', () => {
      const actionsWithQuantity = [
        {
          code: 'CSAM3',
          description: 'Herbal leys: CSAM3',
          requiresMaxQuantity: 18.5673,
          availableArea: { value: 18.5673, unit: 'ha' }
        }
      ]
      const state = {}
      const payload = { landAction: 'CSAM3', landActionQuantity_CSAM3: '' }
      const parcel = { sheetId: 'AB1234', parcelId: '5678' }

      const result = addSelectedActionsToState(state, payload, actionsWithQuantity, parcel)

      expect(result.landParcels['AB1234-5678'].actionsObj).toEqual({})
    })

    // A submitted 0 isn't a real claim on any land, so it's treated the same
    // as never having been submitted - matching the client-side live-refresh
    // treatment of a typed 0 on this same page.
    it('should not save a quantity-required action whose submitted quantity is 0', () => {
      const actionsWithQuantity = [
        {
          code: 'CSAM3',
          description: 'Herbal leys: CSAM3',
          requiresMaxQuantity: 18.5673,
          availableArea: { value: 18.5673, unit: 'ha' }
        }
      ]
      const state = {}
      const payload = { landAction: 'CSAM3', landActionQuantity_CSAM3: '0' }
      const parcel = { sheetId: 'AB1234', parcelId: '5678' }

      const result = addSelectedActionsToState(state, payload, actionsWithQuantity, parcel)

      expect(result.landParcels['AB1234-5678'].actionsObj).toEqual({})
    })

    it('should still save a non-quantity action alongside a skipped quantity-required one', () => {
      const actionsWithQuantity = [
        { code: 'SAM1', description: 'Action 1', availableArea: { value: '10', unit: 'ha' } },
        {
          code: 'CSAM3',
          description: 'Herbal leys: CSAM3',
          requiresMaxQuantity: 18.5673,
          availableArea: { value: 18.5673, unit: 'ha' }
        }
      ]
      const state = {}
      const payload = { landAction: ['SAM1', 'CSAM3'] }
      const parcel = { sheetId: 'AB1234', parcelId: '5678' }

      const result = addSelectedActionsToState(state, payload, actionsWithQuantity, parcel)

      expect(Object.keys(result.landParcels['AB1234-5678'].actionsObj)).toEqual(['SAM1'])
    })
  })

  describe('getAddedActionsForStateParcel', () => {
    it('should return added actions for a parcel', () => {
      const state = {
        landParcels: {
          'AB1234-5678': {
            actionsObj: {
              SAM1: { description: 'Action 1', value: '10' },
              SAM2: { description: 'Action 2', value: '5' }
            }
          }
        }
      }

      const result = getAddedActionsForStateParcel(state, 'AB1234-5678')

      expect(result).toEqual([
        { code: 'SAM1', description: 'Action 1', value: '10' },
        { code: 'SAM2', description: 'Action 2', value: '5' }
      ])
    })

    it('should include the saved quantity value so the input can pre-populate on refresh', () => {
      const state = {
        landParcels: {
          'AB1234-5678': {
            actionsObj: {
              CSAM3: { description: 'Herbal leys: CSAM3', value: '3.25' }
            }
          }
        }
      }

      const result = getAddedActionsForStateParcel(state, 'AB1234-5678')

      expect(result).toEqual([{ code: 'CSAM3', description: 'Herbal leys: CSAM3', value: '3.25' }])
    })

    it('should return empty array when parcel has no actions', () => {
      const state = {
        landParcels: {
          'AB1234-5678': { actionsObj: {} }
        }
      }

      const result = getAddedActionsForStateParcel(state, 'AB1234-5678')

      expect(result).toEqual([])
    })

    it('should return empty array when parcel does not exist', () => {
      const state = { landParcels: {} }

      const result = getAddedActionsForStateParcel(state, 'AB1234-5678')

      expect(result).toEqual([])
    })

    it('should return empty array when state has no landParcels', () => {
      const state = {}

      const result = getAddedActionsForStateParcel(state, 'AB1234-5678')

      expect(result).toEqual([])
    })
  })

  describe('deleteParcelFromState', () => {
    it('should delete parcel from state', () => {
      const state = {
        landParcels: {
          'AB1234-5678': { actionsObj: { SAM1: {} } },
          'CD9999-1111': { actionsObj: { SAM2: {} } }
        }
      }

      const result = deleteParcelFromState(state, 'AB1234-5678')

      expect(result.landParcels).not.toHaveProperty('AB1234-5678')
      expect(result.landParcels).toHaveProperty('CD9999-1111')
    })

    it('should remove landParcels key when deleting last parcel', () => {
      const state = {
        landParcels: {
          'AB1234-5678': { actionsObj: { SAM1: {} } }
        },
        payment: { total: 100 },
        totalPence: 10000,
        totalPayment: 500
      }

      const result = deleteParcelFromState(state, 'AB1234-5678')

      expect(result).not.toHaveProperty('landParcels')
      expect(result).not.toHaveProperty('payment')
      expect(result).not.toHaveProperty('totalPence')
      expect(result).not.toHaveProperty('totalPayment')
    })

    it('should not mutate original state', () => {
      const state = {
        landParcels: {
          'AB1234-5678': { actionsObj: { SAM1: {} } }
        }
      }

      deleteParcelFromState(state, 'AB1234-5678')

      expect(state.landParcels).toHaveProperty('AB1234-5678')
    })
  })

  describe('deleteActionFromState', () => {
    it('should delete action from parcel', () => {
      const state = {
        landParcels: {
          'AB1234-5678': {
            actionsObj: {
              SAM1: { description: 'Action 1' },
              SAM2: { description: 'Action 2' }
            }
          }
        }
      }

      const result = deleteActionFromState(state, 'AB1234-5678', 'SAM1')

      expect(result.landParcels['AB1234-5678'].actionsObj).not.toHaveProperty('SAM1')
      expect(result.landParcels['AB1234-5678'].actionsObj).toHaveProperty('SAM2')
    })

    it('should delete parcel when deleting last action', () => {
      const state = {
        landParcels: {
          'AB1234-5678': { actionsObj: { SAM1: {} } },
          'CD9999-1111': { actionsObj: { SAM2: {} } }
        }
      }

      const result = deleteActionFromState(state, 'AB1234-5678', 'SAM1')

      expect(result.landParcels).not.toHaveProperty('AB1234-5678')
      expect(result.landParcels).toHaveProperty('CD9999-1111')
    })

    it('should remove landParcels key when deleting last action of last parcel', () => {
      const state = {
        landParcels: {
          'AB1234-5678': { actionsObj: { SAM1: {} } }
        },
        payment: { total: 100 },
        totalPence: 10000,
        totalPayment: 500
      }

      const result = deleteActionFromState(state, 'AB1234-5678', 'SAM1')

      expect(result).not.toHaveProperty('landParcels')
      expect(result).not.toHaveProperty('payment')
      expect(result).not.toHaveProperty('totalPence')
      expect(result).not.toHaveProperty('totalPayment')
    })

    it('should handle deleting non-existent action gracefully', () => {
      const state = {
        landParcels: {
          'AB1234-5678': { actionsObj: { SAM1: {} } }
        }
      }

      const result = deleteActionFromState(state, 'AB1234-5678', 'NON_EXISTENT')

      expect(result.landParcels['AB1234-5678'].actionsObj).toHaveProperty('SAM1')
    })
  })

  describe('hasLandParcels', () => {
    it('should return true when parcels exist', () => {
      const state = {
        landParcels: {
          'AB1234-5678': { actionsObj: {} }
        }
      }

      expect(hasLandParcels(state)).toBe(true)
    })

    it('should return false when landParcels is empty', () => {
      const state = { landParcels: {} }

      expect(hasLandParcels(state)).toBe(false)
    })

    it('should return false when landParcels does not exist', () => {
      const state = {}

      expect(hasLandParcels(state)).toBe(false)
    })
  })

  describe('findActionInfoFromState', () => {
    it('should find action information', () => {
      const landParcels = {
        'AB1234-5678': {
          actionsObj: {
            SAM1: { description: 'Action 1', value: '10' }
          }
        }
      }

      const result = findActionInfoFromState(landParcels, 'AB1234-5678', 'SAM1')

      expect(result).toEqual({ description: 'Action 1', value: '10' })
    })

    it('should return null when action does not exist', () => {
      const landParcels = {
        'AB1234-5678': {
          actionsObj: { SAM1: {} }
        }
      }

      const result = findActionInfoFromState(landParcels, 'AB1234-5678', 'NON_EXISTENT')

      expect(result).toBeNull()
    })

    it('should return null when parcel does not exist', () => {
      const landParcels = {}

      const result = findActionInfoFromState(landParcels, 'AB1234-5678', 'SAM1')

      expect(result).toBeNull()
    })
  })

  describe('mergeRecomputedAvailability', () => {
    it('should overwrite availableArea/requiresMaxQuantity from the recomputed match', () => {
      const actions = [
        {
          code: 'CSAM3',
          description: 'Herbal leys',
          availableArea: { value: 0.3271, unit: 'ha' },
          requiresMaxQuantity: 0.3271
        }
      ]
      const recomputed = [{ code: 'CSAM3', availableArea: { value: 0, unit: 'ha' }, requiresMaxQuantity: 0 }]

      const result = mergeRecomputedAvailability(actions, recomputed)

      expect(result[0].availableArea).toEqual({ value: 0, unit: 'ha' })
      expect(result[0].requiresMaxQuantity).toBe(0)
    })

    it("should preserve the action's original availableArea as staticAvailableArea", () => {
      const actions = [{ code: 'CSAM3', description: 'Herbal leys', availableArea: { value: 0.3271, unit: 'ha' } }]
      const recomputed = [{ code: 'CSAM3', availableArea: { value: 0, unit: 'ha' } }]

      const result = mergeRecomputedAvailability(actions, recomputed)

      expect(result[0].staticAvailableArea).toEqual({ value: 0.3271, unit: 'ha' })
      expect(result[0].availableArea).toEqual({ value: 0, unit: 'ha' })
    })

    it('should not overwrite an already-set staticAvailableArea on a second recompute pass', () => {
      const actions = [
        {
          code: 'CSAM3',
          description: 'Herbal leys',
          availableArea: { value: 0, unit: 'ha' },
          staticAvailableArea: { value: 0.3271, unit: 'ha' }
        }
      ]
      const recomputed = [{ code: 'CSAM3', availableArea: { value: 0.1, unit: 'ha' } }]

      const result = mergeRecomputedAvailability(actions, recomputed)

      expect(result[0].staticAvailableArea).toEqual({ value: 0.3271, unit: 'ha' })
    })

    it('should keep the original action unchanged when no recomputed match exists for its code', () => {
      const actions = [{ code: 'CSAM3', description: 'Herbal leys', availableArea: { value: 0.3271, unit: 'ha' } }]

      const result = mergeRecomputedAvailability(actions, [])

      expect(result[0]).toEqual(actions[0])
      expect(result[0].staticAvailableArea).toBeUndefined()
    })
  })

  describe('getAddedActionsFromPayload', () => {
    it('should use the payload value for a quantity-required action', () => {
      const payload = { landAction: 'CSAM3', landActionQuantity_CSAM3: '0.2' }
      const actions = [{ code: 'CSAM3', description: 'Herbal leys', requiresMaxQuantity: 0.3271 }]

      const result = getAddedActionsFromPayload(payload, actions)

      expect(result).toEqual([{ code: 'CSAM3', description: 'Herbal leys', value: '0.2' }])
    })

    it('should fall back to the previous chosen area for a non-quantity action', () => {
      const payload = { landAction: ['CMOR1', 'CSAM3'], landActionQuantity_CSAM3: '0.2' }
      const actions = [
        { code: 'CMOR1', description: 'Moorland record' },
        { code: 'CSAM3', description: 'Herbal leys', requiresMaxQuantity: 0.3271 }
      ]
      const prevAddedActions = [{ code: 'CMOR1', value: 0.1572 }]

      const result = getAddedActionsFromPayload(payload, actions, prevAddedActions)

      expect(result).toContainEqual({ code: 'CMOR1', description: 'Moorland record', value: 0.1572 })
    })

    it('should use an empty value for a non-quantity action with no previous chosen area', () => {
      const payload = { landAction: 'CMOR1' }
      const actions = [{ code: 'CMOR1', description: 'Moorland record' }]

      const result = getAddedActionsFromPayload(payload, actions)

      expect(result).toEqual([{ code: 'CMOR1', description: 'Moorland record', value: '' }])
    })
  })
})

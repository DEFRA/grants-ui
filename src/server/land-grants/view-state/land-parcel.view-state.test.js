import { describe, it, expect } from 'vitest'
import {
  buildNewState,
  addActionsToExistingState,
  getAddedActionsForStateParcel,
  deleteParcelFromState,
  deleteActionFromState,
  hasLandParcels,
  findActionInfoFromState,
  getRequiredConsents
} from './land-parcel.view-state.js'

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
        SAM1: { description: 'Action 1', value: '10', unit: 'ha' },
        SAM2: { description: 'Action 2', value: '5', unit: 'ha' }
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
        value: '',
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
  })

  describe('getAddedActionsForStateParcel', () => {
    it('should return added actions for a parcel', () => {
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

      const result = getAddedActionsForStateParcel(state, 'AB1234-5678')

      expect(result).toEqual([
        { code: 'SAM1', description: 'Action 1' },
        { code: 'SAM2', description: 'Action 2' }
      ])
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
        draftApplicationAnnualTotalPence: 10000
      }

      const result = deleteParcelFromState(state, 'AB1234-5678')

      expect(result).not.toHaveProperty('landParcels')
      expect(result).not.toHaveProperty('payment')
      expect(result).not.toHaveProperty('draftApplicationAnnualTotalPence')
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
        draftApplicationAnnualTotalPence: 10000
      }

      const result = deleteActionFromState(state, 'AB1234-5678', 'SAM1')

      expect(result).not.toHaveProperty('landParcels')
      expect(result).not.toHaveProperty('payment')
      expect(result).not.toHaveProperty('draftApplicationAnnualTotalPence')
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

  describe('getRequiredConsents', () => {
    it('should return empty in array when state has no land parcels', () => {
      const state = {}

      const result = getRequiredConsents(state)

      expect(result).toEqual([])
    })

    it('should return empty in array when landParcels is empty', () => {
      const state = { landParcels: {} }

      const result = getRequiredConsents(state)

      expect(result).toEqual([])
    })

    it('should return array with sssi when SSSI consent is required', () => {
      const state = {
        landParcels: {
          'AB1234-5678': {
            actionsObj: {
              SAM1: { description: 'Action 1', sssiConsentRequired: true }
            }
          }
        }
      }

      const result = getRequiredConsents(state)

      expect(result).toContain('sssi')
      expect(result.length).toBeGreaterThanOrEqual(1)
    })

    it('should return empty array when no consent checks pass', () => {
      const state = {
        landParcels: {
          'AB1234-5678': {
            actionsObj: {
              SAM1: { description: 'Action 1', sssiConsentRequired: false }
            }
          }
        }
      }

      const result = getRequiredConsents(state)

      expect(result).toEqual([])
    })

    it('should support multiple consent types in the future', () => {
      const state = {
        landParcels: {
          'AB1234-5678': {
            actionsObj: {
              SAM1: { description: 'Action 1', sssiConsentRequired: true }
            }
          }
        }
      }

      const result = getRequiredConsents(state)

      expect(Array.isArray(result)).toBe(true)
      expect(result).toContain('sssi')
    })
  })
})

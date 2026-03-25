import { getRequiredConsents } from './consents.js'

describe('getRequiredConsents', () => {
  it('should return empty array when state has no landParcels', () => {
    expect(getRequiredConsents({})).toEqual([])
  })

  it('should return empty array when landParcels is empty', () => {
    expect(getRequiredConsents({ landParcels: {} })).toEqual([])
  })

  it('should return unique consent types across all parcels and actions', () => {
    const state = {
      landParcels: {
        'AB1234-5678': { actionsObj: { ACTION1: { consents: ['sssi'] }, ACTION2: { consents: ['sssi'] } } },
        'CD5678-9012': { actionsObj: { ACTION3: { consents: ['hefer'] } } }
      }
    }
    expect(getRequiredConsents(state)).toEqual(['sssi', 'hefer'])
  })

  it('should return only sssi when all actions require sssi', () => {
    const state = {
      landParcels: {
        'AB1234-5678': { actionsObj: { ACTION1: { consents: ['sssi'] }, ACTION2: { consents: ['sssi'] } } }
      }
    }
    expect(getRequiredConsents(state)).toEqual(['sssi'])
  })

  it('should return only hefer when all actions require hefer', () => {
    const state = {
      landParcels: {
        'AB1234-5678': { actionsObj: { ACTION1: { consents: ['hefer'] } } }
      }
    }
    expect(getRequiredConsents(state)).toEqual(['hefer'])
  })

  it('should return empty array when all actions have empty consents', () => {
    const state = {
      landParcels: {
        'AB1234-5678': { actionsObj: { ACTION1: { consents: [] } } }
      }
    }
    expect(getRequiredConsents(state)).toEqual([])
  })

  it('should handle parcels with missing actionsObj', () => {
    const state = {
      landParcels: {
        'AB1234-5678': {},
        'CD5678-9012': { actionsObj: { ACTION1: { consents: ['sssi'] } } }
      }
    }
    expect(getRequiredConsents(state)).toEqual(['sssi'])
  })

  it('should handle actions with missing consents field', () => {
    const state = {
      landParcels: {
        'AB1234-5678': { actionsObj: { ACTION1: {}, ACTION2: { consents: ['hefer'] } } }
      }
    }
    expect(getRequiredConsents(state)).toEqual(['hefer'])
  })

  it('should handle parcels with no actionsObj', () => {
    const state = {
      landParcels: {
        'AB1234-5678': { anotherObj: { ACTION1: null, ACTION2: { consents: ['sssi'] } } }
      }
    }
    expect(getRequiredConsents(state)).toEqual([])
  })
})

import { describe, it, expect } from 'vitest'
import { TOTAL_ACTION_AREA_GUIDANCE, areaWithUnitText, availableAreaText } from './area-text.js'

describe('area-text', () => {
  it('states that a total action consumes the whole available area', () => {
    expect(TOTAL_ACTION_AREA_GUIDANCE).toBe('This action will use all the available area on this land parcel.')
  })

  describe('areaWithUnitText', () => {
    it('renders an area at four decimal places with its full unit name', () => {
      expect(areaWithUnitText(39.81, 'ha')).toBe('39.8100 hectares')
    })

    it('rounds to 4dp rather than printing full float precision', () => {
      expect(areaWithUnitText(0.32712345, 'ha')).toBe('0.3271 hectares')
    })

    it('uses the action own unit, not a hardcoded hectare', () => {
      expect(areaWithUnitText(120, 'm')).toBe('120.0000 metres')
    })

    it('omits the unit entirely when there is none, rather than printing a gap', () => {
      expect(areaWithUnitText(1, undefined)).toBe('1.0000')
    })
  })

  describe('availableAreaText', () => {
    it('reports a fully claimed action as an explicit 0.0000 available', () => {
      expect(availableAreaText(0, 'ha')).toBe('0.0000 hectares available')
    })

    it('reports leftover headroom as the available area', () => {
      expect(availableAreaText(2.5, 'ha')).toBe('2.5000 hectares available')
    })

    it('keeps the unit out of the text when the action has none', () => {
      expect(availableAreaText(1, undefined)).toBe('1.0000 available')
    })
  })
})

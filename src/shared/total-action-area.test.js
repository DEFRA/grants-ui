import { describe, it, expect } from 'vitest'
import { TOTAL_ACTION_AREA_GUIDANCE, totalActionAppliedText } from './total-action-area.js'

describe('total-action-area', () => {
  it('states that a total action consumes the whole available area', () => {
    expect(TOTAL_ACTION_AREA_GUIDANCE).toBe('This action will use all the available area on this land parcel.')
  })

  describe('totalActionAppliedText', () => {
    it('reports a fully claimed parcel as an explicit 0.0000 remaining', () => {
      expect(totalActionAppliedText(31.89, 0, 'ha')).toBe('31.8900 hectares applied, 0.0000 hectares remaining')
    })

    it('reports leftover headroom as the remaining area', () => {
      expect(totalActionAppliedText(9.5, 2.5, 'ha')).toBe('9.5000 hectares applied, 2.5000 hectares remaining')
    })

    it('rounds to 4dp rather than printing full float precision', () => {
      expect(totalActionAppliedText(0.32712345, 0.00001, 'ha')).toBe(
        '0.3271 hectares applied, 0.0000 hectares remaining'
      )
    })

    it('uses the action own unit, not a hardcoded hectare', () => {
      expect(totalActionAppliedText(120, 0, 'm')).toBe('120.0000 metres applied, 0.0000 metres remaining')
    })

    it('omits the unit entirely when there is none, rather than printing a gap', () => {
      expect(totalActionAppliedText(1, 0, undefined)).toBe('1.0000 applied, 0.0000 remaining')
    })
  })
})

import { describe, it, expect } from 'vitest'
import { mapConsentPanelToViewModel } from './consent.view-model.js'

describe('consent.view-model', () => {
  describe('mapConsentPanelToViewModel', () => {
    it('should return null when no consents are required', () => {
      expect(mapConsentPanelToViewModel([])).toBeNull()
    })

    it('should return SSSI panel when only SSSI consent required', () => {
      const result = mapConsentPanelToViewModel(['sssi'])

      expect(result.consentType).toBe('sssi')
      expect(result.sssiConsentLink).toBeDefined()
      expect(result.heferLink).toBeUndefined()
    })

    it('should return HEFER panel when only HEFER consent required', () => {
      const result = mapConsentPanelToViewModel(['hefer'])

      expect(result.consentType).toBe('hefer')
      expect(result.heferLink).toBeDefined()
      expect(result.sssiConsentLink).toBeUndefined()
    })

    it('should return combined panel when both consent types required', () => {
      const result = mapConsentPanelToViewModel(['sssi', 'hefer'])

      expect(result.consentType).toBe('all')
      expect(result.sssiConsentLink).toBeDefined()
      expect(result.heferLink).toBeDefined()
    })

    it('should return null when consents array has unknown types only', () => {
      expect(mapConsentPanelToViewModel(['unknown'])).toBeNull()
    })
  })
})

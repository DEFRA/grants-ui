import { describe, it, expect } from 'vitest'
import { mapConsentPanelToViewModel } from './consent.view-model.js'

describe('consent.view-model', () => {
  describe('mapConsentPanelToViewModel', () => {
    it('should return null when no consents are required', () => {
      expect(mapConsentPanelToViewModel([], 1)).toBeNull()
    })

    it('should return SSSI panel when only SSSI consent required', () => {
      const result = mapConsentPanelToViewModel(['sssi'], 3)

      expect(result.consentType).toBe('sssi')
      expect(result.titleText).toBe('You must have SSSI consent')
      expect(result.sssiConsentLink).toBeDefined()
      expect(result.heferLink).toBeUndefined()
    })

    it('should return HEFER panel when only HEFER consent required', () => {
      const result = mapConsentPanelToViewModel(['hefer'], 2)

      expect(result.consentType).toBe('hefer')
      expect(result.titleText).toBe(
        'You must get an SFI Historic Environment Farm Environment Record (SFI HEFER) from Historic England'
      )
      expect(result.heferLink).toBeDefined()
      expect(result.sssiConsentLink).toBeUndefined()
    })

    it('should return combined panel with plural title when multiple actions', () => {
      const result = mapConsentPanelToViewModel(['sssi', 'hefer'], 3)

      expect(result.consentType).toBe('all')
      expect(result.titleText).toBe('You must get consent to do your actions')
      expect(result.sssiConsentLink).toBeDefined()
      expect(result.heferLink).toBeDefined()
    })

    it('should return combined panel with singular title when one action', () => {
      const result = mapConsentPanelToViewModel(['sssi', 'hefer'], 1)

      expect(result.consentType).toBe('all')
      expect(result.titleText).toBe('You must get consent to do your action')
    })

    it('should return null when consents array has unknown types only', () => {
      expect(mapConsentPanelToViewModel(['unknown'], 1)).toBeNull()
    })
  })
})

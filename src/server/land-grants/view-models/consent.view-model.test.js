import { describe, it, expect } from 'vitest'
import { mapConsentPanelToViewModel } from './consent.view-model.js'

describe('consent.view-model', () => {
  describe('mapConsentPanelToViewModel', () => {
    it('should return null when no consents are required', () => {
      expect(mapConsentPanelToViewModel([])).toBeNull()
    })

    it('should return SSSI panel with original text when only SSSI consent required', () => {
      const result = mapConsentPanelToViewModel(['sssi'])

      expect(result.titleText).toBe('You must have SSSI consent')
      expect(result.html).toContain('site of special scientific interest (SSSI)')
      expect(result.html).toContain('SSSI consent from Natural England')
      expect(result.html).toContain('guidance on SSSI consent')
    })

    it('should return HEFER panel when only HEFER consent required', () => {
      const result = mapConsentPanelToViewModel(['hefer'])

      expect(result.titleText).toBe(
        'You must get an SFI Historic Environment Farm Environment Record (SFI HEFER) from Historic England'
      )
      expect(result.html).toContain('historic or archaeological features')
      expect(result.html).toContain('HEFER')
    })

    it('should return combined panel with bullet list when both consents required', () => {
      const result = mapConsentPanelToViewModel(['sssi', 'hefer'])

      expect(result.titleText).toBe('You must get consent to do your actions')
      expect(result.html).toContain('SSSI')
      expect(result.html).toContain('HEFER')
      expect(result.html).toContain('Natural England')
      expect(result.html).toContain('Historic England')
      expect(result.html).toContain('<ul')
      expect(result.html).toContain('<li')
    })

    it('should return null when consents array has unknown types only', () => {
      expect(mapConsentPanelToViewModel(['unknown'])).toBeNull()
    })
  })
})

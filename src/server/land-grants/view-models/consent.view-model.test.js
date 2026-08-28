import { describe, it, expect } from 'vitest'
import { getConsentNotice, getConsentRequirementText, mapConsentPanelToViewModel } from './consent.view-model.js'

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

  describe('getConsentRequirementText', () => {
    it('should return an empty string when no consents are required', () => {
      expect(getConsentRequirementText([])).toBe('')
    })

    it('should return the SSSI requirement when only SSSI consent is required', () => {
      expect(getConsentRequirementText(['sssi'])).toBe('Requires SSSI consent')
    })

    it('should return the HEFER requirement when only a HEFER is required', () => {
      expect(getConsentRequirementText(['hefer'])).toBe('Requires an SFI HEFER')
    })

    it('should return both requirements when both consent types are required', () => {
      expect(getConsentRequirementText(['sssi', 'hefer'])).toBe('Requires SSSI consent and an SFI HEFER')
    })

    it('should keep SSSI first when the keys arrive in the other order', () => {
      expect(getConsentRequirementText(['hefer', 'sssi'])).toBe('Requires SSSI consent and an SFI HEFER')
    })

    it('should return an empty string for unknown consent keys only', () => {
      expect(getConsentRequirementText(['unknown'])).toBe('')
    })

    it('should return an empty string when the consents value is not an array', () => {
      expect(getConsentRequirementText(undefined)).toBe('')
    })
  })

  describe('getConsentNotice', () => {
    const sssi = 'site of special scientific interest (SSSI) consent'
    const hefer = 'a Historic Environment Farm Environment Record (HEFER)'

    it.each([
      [[], { text: '', items: [] }],
      [['sssi'], { text: 'Some actions require:', items: [sssi] }],
      [['hefer'], { text: 'Some actions require:', items: [hefer] }],
      [['sssi', 'hefer'], { text: 'Some actions require:', items: [sssi, hefer] }],
      [['hefer', 'sssi'], { text: 'Some actions require:', items: [sssi, hefer] }],
      [['unknown'], { text: '', items: [] }],
      [undefined, { text: '', items: [] }]
    ])('renders %j as %j', (consents, expected) => {
      expect(getConsentNotice(consents)).toEqual(expected)
    })
  })
})

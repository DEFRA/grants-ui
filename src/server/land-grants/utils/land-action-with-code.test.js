import { landActionWithCode, landActionWithConsentData } from './land-action-with-code.js'

describe('landActionWithCode', () => {
  it('should format land action with code', () => {
    const result = landActionWithCode('Action description', 'Code')
    expect(result).toBe('Action description: Code')
  })

  it('should return description only if no code is provided', () => {
    const result = landActionWithCode('Action description', null)
    expect(result).toBe('Action description')
  })

  it('should return code only if no description is provided', () => {
    const result = landActionWithCode(null, 'CMOR1')
    expect(result).toBe('CMOR1')
  })

  it('should return empty string if both description and code are missing', () => {
    const result = landActionWithCode(null, null)
    expect(result).toBe('')
  })

  it('should handle undefined values gracefully', () => {
    expect(landActionWithCode(undefined, 'CMOR1')).toBe('CMOR1')
    expect(landActionWithCode('Description', undefined)).toBe('Description')
    expect(landActionWithCode(undefined, undefined)).toBe('')
  })

  it('should handle empty strings gracefully', () => {
    expect(landActionWithCode('', 'CMOR1')).toBe('CMOR1')
    expect(landActionWithCode('Description', '')).toBe('Description')
    expect(landActionWithCode('', '')).toBe('')
  })
})

describe('landActionWithConsentData', () => {
  it('should format land action with code and SSSI consent when required', () => {
    const result = landActionWithConsentData('Moorland Assessment', 'CMOR1', true)
    expect(result).toBe('Moorland Assessment: CMOR1. SSSI consent needed.')
  })

  it('should format land action with code without SSSI consent when not required', () => {
    const result = landActionWithConsentData('Moorland Assessment', 'CMOR1', false)
    expect(result).toBe('Moorland Assessment: CMOR1')
  })

  it('should format land action with code when sssiConsentRequired is undefined', () => {
    const result = landActionWithConsentData('Moorland Assessment', 'CMOR1', undefined)
    expect(result).toBe('Moorland Assessment: CMOR1')
  })

  it('should format land action with code when sssiConsentRequired is null', () => {
    const result = landActionWithConsentData('Moorland Assessment', 'CMOR1', null)
    expect(result).toBe('Moorland Assessment: CMOR1')
  })
})

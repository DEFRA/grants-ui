import { getSafeRedirect } from './get-safe-redirect.js'

describe('getSafeRedirect', () => {
  it('should return the redirect path when it starts with a slash', () => {
    expect(getSafeRedirect('/dashboard')).toBe('/dashboard')
    expect(getSafeRedirect('/profile/settings')).toBe('/profile/settings')
    expect(getSafeRedirect('/')).toBe('/')
  })

  it('should return /home when redirect is null or undefined', () => {
    expect(getSafeRedirect(null)).toBe('/home')
    expect(getSafeRedirect(undefined)).toBe('/home')
  })

  it('should return /home when redirect does not start with a slash', () => {
    expect(getSafeRedirect('dashboard')).toBe('/home')
    expect(getSafeRedirect('https://external-site.com')).toBe('/home')
    expect(getSafeRedirect('http://malicious-site.com')).toBe('/home')
    expect(getSafeRedirect('')).toBe('/home')
  })

  it('should handle empty strings correctly', () => {
    // Empty strings
    expect(getSafeRedirect('')).toBe('/home')
  })

  it('should throw error for non-string primitives without startsWith method', () => {
    expect(() => getSafeRedirect(0)).toThrow()
    expect(() => getSafeRedirect(false)).toThrow()
  })

  it('should handle objects with startsWith property', () => {
    const objectWithStartsWith = {
      startsWith: () => true
    }
    expect(getSafeRedirect(objectWithStartsWith)).toBe(objectWithStartsWith)
  })
})

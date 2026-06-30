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

  it('should return /home for protocol-relative URLs (open redirect variants)', () => {
    expect(getSafeRedirect('//example.com')).toBe('/home')
    expect(getSafeRedirect('//attacker.com/phish')).toBe('/home')
    expect(getSafeRedirect('//www.resillion.com')).toBe('/home')
    expect(getSafeRedirect('/\\example.com')).toBe('/home')
    expect(getSafeRedirect('/\\evil.test')).toBe('/home')
    expect(getSafeRedirect('///example.com')).toBe('/home')
  })

  it('should handle empty strings correctly', () => {
    // Empty strings
    expect(getSafeRedirect('')).toBe('/home')
  })

  it('should throw for non-null non-string values outside the typed contract', () => {
    expect(() => getSafeRedirect(0)).toThrow(TypeError)
    expect(() => getSafeRedirect(false)).toThrow(TypeError)
    expect(() => getSafeRedirect({ startsWith: () => true })).toThrow(TypeError)
  })
})

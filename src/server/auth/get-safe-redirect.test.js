import { getSafeRedirect, isSafeRedirect } from './get-safe-redirect.js'

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

  it('should return /home when the path contains control characters (open redirect variants)', () => {
    expect(getSafeRedirect('/\t/evil.test')).toBe('/home')
    expect(getSafeRedirect('/\n/evil.test')).toBe('/home')
    expect(getSafeRedirect('/\r/evil.test')).toBe('/home')
    expect(getSafeRedirect('/\t\\evil.test')).toBe('/home')
    expect(getSafeRedirect('/dashboard\u0000')).toBe('/home')
    expect(getSafeRedirect('/dashboard\u007F')).toBe('/home')
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

describe('isSafeRedirect', () => {
  it.each(['/', '/dashboard', '/page?param=value'])('should accept same-origin relative path %s', (redirect) => {
    expect(isSafeRedirect(redirect)).toBe(true)
  })

  it.each([
    '',
    'dashboard',
    'https://evil.test',
    '//evil.test',
    '/\\evil.test',
    '/\t/evil.test',
    '/\n/evil.test',
    null,
    undefined,
    0,
    ['/a', '/b']
  ])('should reject %j', (redirect) => {
    expect(isSafeRedirect(redirect)).toBe(false)
  })
})

import { expect, test, describe } from 'vitest'

const SEMVER_REGEX = /^\d+\.\d+\.\d+(?:-[\da-z-]+(?:\.[\da-z-]+)*)?(?:\+[\da-z-]+(?:\.[\da-z-]+)*)?$/i

describe('Semver Regex', () => {
  test('matches standard semver', () => {
    expect('1.1.1').toMatch(SEMVER_REGEX)
    expect('0.0.1').toMatch(SEMVER_REGEX)
    expect('10.20.30').toMatch(SEMVER_REGEX)
  })

  test('matches semver with prerelease', () => {
    expect('1.0.0-alpha').toMatch(SEMVER_REGEX)
    expect('1.0.0-alpha.1').toMatch(SEMVER_REGEX)
    expect('1.0.0-0.3.7').toMatch(SEMVER_REGEX)
    expect('1.0.0-x.7.z.92').toMatch(SEMVER_REGEX)
  })

  test('matches semver with build metadata', () => {
    expect('1.0.0+20130313144700').toMatch(SEMVER_REGEX)
    expect('1.0.0-beta+exp.sha.5114f85').toMatch(SEMVER_REGEX)
  })

  test('does not match invalid semver', () => {
    expect('1.1').not.toMatch(SEMVER_REGEX)
    expect('v1.1.1').not.toMatch(SEMVER_REGEX)
    expect('1.1.1.1').not.toMatch(SEMVER_REGEX)
    expect('abc').not.toMatch(SEMVER_REGEX)
  })
})

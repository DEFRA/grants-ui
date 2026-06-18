import { describe, expect, it } from 'vitest'
import { SEMVER_PATTERN, Semver } from '~/.vitest/semver.js'

describe('Semver', () => {
  it.each(['1.0.0', '0.1.2', '1.2.3-alpha.1', '1.2.3+build.5', '1.2.3-alpha+build'])(
    'matches valid semver string %s',
    (version) => {
      expect(version).toMatch(SEMVER_PATTERN)
      expect({ version }).toEqual({ version: expect.any(Semver) })
    }
  )

  it.each(['1', '1.0', '01.0.0', '1.0.0.0', 1, null, undefined, ''])('rejects invalid semver value %s', (version) => {
    expect(version).not.toEqual(expect.any(Semver))
  })

  it('is initialised as a global test expectation helper', () => {
    expect({ configVersion: '1.2.3' }).toEqual(
      expect.objectContaining({
        configVersion: expect.any(globalThis.Semver)
      })
    )
  })
})

import { describe, it, expect, vi } from 'vitest'
import { getActionConsentKeys, getConsentTypes, getRequiredActionConsents } from './consent-types.js'

const configState = vi.hoisted(() => {
  const values = new Map()
  return {
    set(key, value) {
      values.set(key, value)
    },
    reset() {
      values.clear()
    },
    get(key) {
      return values.get(key) ?? false
    }
  }
})

vi.mock('~/src/config/config.js', () => ({
  config: {
    get: (/** @type {string} */ key) => configState.get(key)
  }
}))

const bothFlagsOn = () => {
  configState.set('landGrants.enableSSSIFeature', true)
  configState.set('landGrants.enableHeferFeature', true)
}

describe('consent-types', () => {
  afterEach(() => {
    configState.reset()
  })

  describe('getConsentTypes', () => {
    it('should return no consent types when both feature flags are off', () => {
      expect(getConsentTypes()).toEqual([])
    })

    it('should return sssi before hefer when both feature flags are on', () => {
      bothFlagsOn()

      expect(getConsentTypes()).toEqual([
        { key: 'sssi', apiField: 'sssiConsentRequired' },
        { key: 'hefer', apiField: 'heferRequired' }
      ])
    })
  })

  describe('getActionConsentKeys', () => {
    it('should return an empty array for an action with neither requirement', () => {
      bothFlagsOn()

      expect(getActionConsentKeys({ code: 'SAM1' })).toEqual([])
    })

    it('should return sssi for an action requiring SSSI consent', () => {
      bothFlagsOn()

      expect(getActionConsentKeys({ code: 'SCR2', sssiConsentRequired: true })).toEqual(['sssi'])
    })

    it('should return hefer for an action requiring a HEFER', () => {
      bothFlagsOn()

      expect(getActionConsentKeys({ code: 'GRH12', heferRequired: true })).toEqual(['hefer'])
    })

    it('should return sssi before hefer for an action requiring both', () => {
      bothFlagsOn()

      expect(getActionConsentKeys({ code: 'SCR2', heferRequired: true, sssiConsentRequired: true })).toEqual([
        'sssi',
        'hefer'
      ])
    })

    it('should omit a key whose feature flag is off, even when the action has the field set', () => {
      configState.set('landGrants.enableSSSIFeature', true)

      expect(getActionConsentKeys({ code: 'SCR2', sssiConsentRequired: true, heferRequired: true })).toEqual(['sssi'])
    })
  })

  describe('getRequiredActionConsents', () => {
    it('should return an empty array when no action requires SSSI consent or HEFER', () => {
      bothFlagsOn()

      expect(getRequiredActionConsents([{ code: 'SAM1', description: 'Action 1' }])).toEqual([])
    })

    it('should include sssi when at least one action requires SSSI consent', () => {
      configState.set('landGrants.enableSSSIFeature', true)

      expect(
        getRequiredActionConsents([{ code: 'SAM1' }, { code: 'SCR2', sssiConsentRequired: true }])
      ).toEqual(['sssi'])
    })

    it('should include hefer when at least one action requires a HEFER', () => {
      configState.set('landGrants.enableHeferFeature', true)

      expect(getRequiredActionConsents([{ code: 'SAM1' }, { code: 'GRH12', heferRequired: true }])).toEqual(['hefer'])
    })

    it('should include both keys, without duplicates, when multiple actions require different consents', () => {
      bothFlagsOn()

      expect(
        getRequiredActionConsents([
          { code: 'SCR2', sssiConsentRequired: true },
          { code: 'GRH12', heferRequired: true },
          { code: 'SCR3', sssiConsentRequired: true }
        ])
      ).toEqual(['sssi', 'hefer'])
    })

    it('should return sssi before hefer whatever order the actions arrive in', () => {
      bothFlagsOn()

      expect(
        getRequiredActionConsents([{ code: 'GRH12', heferRequired: true }, { code: 'SCR2', sssiConsentRequired: true }])
      ).toEqual(['sssi', 'hefer'])
    })

    it('should return an empty array when the relevant feature flag is off, even if the action has the flag set', () => {
      expect(getRequiredActionConsents([{ code: 'GRH12', heferRequired: true }])).toEqual([])
    })

    it('should return an empty array for an empty actions list', () => {
      bothFlagsOn()

      expect(getRequiredActionConsents([])).toEqual([])
    })
  })
})

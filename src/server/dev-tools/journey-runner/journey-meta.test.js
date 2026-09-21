import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  DEFAULT_CRN,
  JOURNEY_CRNS,
  WONT_COMPLETE,
  defaultCrn,
  journeyCrnOptions,
  wontCompleteReason
} from './journey-meta.js'

const journeysDir = resolve(import.meta.dirname, './journeys')
const UNLISTED_JOURNEY = 'pigs-might-fly'

describe('journey-meta', () => {
  describe('drift guard', () => {
    it.each([...new Set([...Object.keys(JOURNEY_CRNS), ...Object.keys(WONT_COMPLETE)])])(
      'has a journey definition for "%s"',
      (slug) => {
        expect(existsSync(resolve(journeysDir, `${slug}.json`))).toBe(true)
      }
    )
  })

  describe('journeyCrnOptions', () => {
    it('returns the journey-specific CRNs, most suitable first', () => {
      const options = journeyCrnOptions('grasslands')

      expect(options.map((o) => o.crn)).toEqual(['1102838829', '1103313150'])
    })

    it('falls back to the allowAll default CRN for unlisted journeys', () => {
      expect(journeyCrnOptions(UNLISTED_JOURNEY)).toEqual([{ crn: DEFAULT_CRN, note: 'allowlisted for all CRNs' }])
    })
  })

  describe('defaultCrn', () => {
    it('returns the first listed CRN for a journey with its own allowlist', () => {
      expect(defaultCrn('woodland')).toBe('1062311181')
    })

    it('returns DEFAULT_CRN for an unlisted journey', () => {
      expect(defaultCrn(UNLISTED_JOURNEY)).toBe(DEFAULT_CRN)
    })
  })

  describe('wontCompleteReason', () => {
    it('returns the printable reason lines for a known-blocked journey', () => {
      expect(wontCompleteReason('methane')).toBe(WONT_COMPLETE.methane)
    })

    it('returns null for a journey that runs normally', () => {
      expect(wontCompleteReason('woodland')).toBeNull()
    })
  })
})

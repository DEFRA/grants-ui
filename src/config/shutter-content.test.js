import { afterEach, describe, expect, test, vi } from 'vitest'
import { shutterContentFor } from './shutter-content.js'

describe('shutterContentFor', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test.each([
    ['woodland', 'SHUTTER_ENABLED_CONTENT_WOODLAND'],
    ['water-management', 'SHUTTER_ENABLED_CONTENT_WATER_MANAGEMENT'],
    ['example.grant-2', 'SHUTTER_ENABLED_CONTENT_EXAMPLE_GRANT_2']
  ])('reads the content for %s from %s', (slug, variable) => {
    vi.stubEnv(variable, ' <p class="govuk-body">Back soon</p> ')

    expect(shutterContentFor(slug)).toBe('<p class="govuk-body">Back soon</p>')
  })

  test.each([
    ['unset', undefined],
    ['blank', '   ']
  ])('returns undefined when the variable is %s', (_, value) => {
    vi.stubEnv('SHUTTER_ENABLED_CONTENT_WOODLAND', value)

    expect(shutterContentFor('woodland')).toBeUndefined()
  })
})

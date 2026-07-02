import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const composeTestsConfig = parse(readFileSync('compose.tests.yml', 'utf8'))
const enableUpl8ByDefault = '$' + '{ENABLE_UPL_8_AND_10_20260303:-true}'

describe('compose.tests.yml', () => {
  it('enables UPL8 journey-test suites in CI by default', () => {
    const environment = composeTestsConfig.services['land-grants-journey-tests'].environment

    expect(environment.ENABLE_UPL_8_AND_10_20260303).toBe(enableUpl8ByDefault)
  })
})

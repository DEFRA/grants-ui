import { validateConsolidatedViewAuthConfig } from './validate-consolidated-view-auth.js'

const configWith = (values) => ({ get: (key) => values[key] })

describe('validateConsolidatedViewAuthConfig', () => {
  it.each(['local', 'dev', 'perf-test', 'ext-test', 'test', 'prod'])('accepts auth enabled in %s', (cdpEnvironment) => {
    expect(() =>
      validateConsolidatedViewAuthConfig(configWith({ 'consolidatedView.authEnabled': true, cdpEnvironment }))
    ).not.toThrow()
  })

  it.each(['local', 'dev', 'perf-test', 'ext-test'])('accepts auth disabled in %s', (cdpEnvironment) => {
    expect(() =>
      validateConsolidatedViewAuthConfig(configWith({ 'consolidatedView.authEnabled': false, cdpEnvironment }))
    ).not.toThrow()
  })

  it.each(['test', 'prod'])('refuses auth disabled in %s', (cdpEnvironment) => {
    expect(() =>
      validateConsolidatedViewAuthConfig(configWith({ 'consolidatedView.authEnabled': false, cdpEnvironment }))
    ).toThrow(`CV_API_AUTH_ENABLED=false is not allowed in the ${cdpEnvironment} environment`)
  })
})

import { APPLICATIONS_PATH, applicationsSelectorPath } from './applications-path.js'

describe('applications-path', () => {
  it('exposes the applications path segment', () => {
    expect(APPLICATIONS_PATH).toBe('/applications')
  })

  it('builds the selector path below the grant slug', () => {
    expect(applicationsSelectorPath('my-grant')).toBe('/my-grant/applications')
  })
})

import { getGrantVersion } from './grant-version.js'

describe('getGrantVersion', () => {
  test('returns the envelope-resolved version recorded on request.app.grantVersion', () => {
    const request = { app: { grantVersion: '2.1.0' } }

    expect(getGrantVersion(request)).toBe('2.1.0')
  })

  test('falls back to the version stamped on the form model metadata', () => {
    const request = { app: { model: { def: { metadata: { version: '1.0.1' } } } } }

    expect(getGrantVersion(request)).toBe('1.0.1')
  })

  test('prefers request.app.grantVersion over the model metadata version', () => {
    const request = {
      app: {
        grantVersion: '3.0.0',
        model: { def: { metadata: { version: '1.0.0' } } }
      }
    }

    expect(getGrantVersion(request)).toBe('3.0.0')
  })

  test.each([
    ['request.app is empty', { app: {} }],
    ['model metadata has no version', { app: { model: { def: { metadata: {} } } } }],
    ['version is an empty string', { app: { grantVersion: '' } }],
    ['request is undefined', undefined]
  ])('throws Missing grantVersion when %s', (_name, request) => {
    expect(() => getGrantVersion(request)).toThrow('Missing grantVersion')
  })
})

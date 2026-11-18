import { buildNavigation } from '~/src/config/nunjucks/context/build-navigation.js'

describe('#buildNavigation', () => {
  test.each(['/test-grant/start', '/test-grant/confirmation'])(
    'links to the grant applications page from %s',
    (path) => {
      expect(
        buildNavigation({
          path,
          params: { slug: 'test-grant' },
          app: { model: { def: { metadata: { allowMultipleApplications: true } } } }
        })
      ).toEqual([{ text: 'Manage your applications', href: '/test-grant/applications', current: false }])
    }
  )

  test.each([undefined, false, 'true', 1])(
    'omits the link unless allowMultipleApplications is true (%j)',
    (enabled) => {
      expect(
        buildNavigation({
          params: { slug: 'test-grant' },
          app: { model: { def: { metadata: { allowMultipleApplications: /** @type {any} */ (enabled) } } } }
        })
      ).toEqual([])
    }
  )

  test.each([undefined, null, {}, { params: { slug: 'test-grant' } }, { app: { model: { def: {} } } }])(
    'omits the link when request or definition context is missing (%j)',
    (request) => {
      expect(buildNavigation(request)).toEqual([])
    }
  )

  test('omits the link when the definition enables multiple applications but the grant slug is missing', () => {
    expect(buildNavigation({ app: { model: { def: { metadata: { allowMultipleApplications: true } } } } })).toEqual([])
  })

  test('uses supplied metadata for the applications page without requiring a form model', () => {
    expect(
      buildNavigation(
        { path: '/test-grant/applications', params: { slug: 'test-grant' } },
        { allowMultipleApplications: true }
      )
    ).toEqual([{ text: 'Manage your applications', href: '/test-grant/applications', current: true }])
  })
})

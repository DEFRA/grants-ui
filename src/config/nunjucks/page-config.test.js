import {
  pageHideBackLink,
  pageRpaDetails,
  pageSubmitButtonText,
  resolvePageConfig,
  resolvePageConfigFromRequest
} from '~/src/config/nunjucks/page-config.js'

describe('#resolvePageConfig', () => {
  const makePage = (path, pageConfig, supportEmail) => ({
    path,
    def: { metadata: { pageConfig, supportEmail } }
  })

  test('returns the config for the current page path', () => {
    const page = makePage('/check-your-answers', { '/check-your-answers': { hideBackLink: true } })
    expect(resolvePageConfig(page)).toEqual({ hideBackLink: true })
  })

  test('returns an empty object when the path has no matching config', () => {
    const page = makePage('/other', { '/check-your-answers': { hideBackLink: true } })
    expect(resolvePageConfig(page)).toEqual({})
  })

  test('returns an empty object when there is no page config at all', () => {
    expect(resolvePageConfig(makePage('/check-your-answers', undefined))).toEqual({})
    expect(resolvePageConfig({ path: '/check-your-answers' })).toEqual({})
  })

  test('returns an empty object when the page or path is missing', () => {
    expect(resolvePageConfig()).toEqual({})
    expect(resolvePageConfig({ def: { metadata: { pageConfig: { '/x': { hideBackLink: true } } } } })).toEqual({})
  })
})

describe('#resolvePageConfigFromRequest', () => {
  const makeRequest = (pathParam, pageConfig) => ({
    params: { path: pathParam },
    app: { model: { def: { metadata: { pageConfig } } } }
  })

  test('keys the config by the leading-slash page path from request params', () => {
    const request = makeRequest('check-your-answers', { '/check-your-answers': { submitButtonText: 'Submit' } })
    expect(resolvePageConfigFromRequest(request)).toEqual({ submitButtonText: 'Submit' })
  })

  test('returns an empty object when there is no matching page config', () => {
    expect(resolvePageConfigFromRequest(makeRequest('other', { '/check-your-answers': {} }))).toEqual({})
    expect(resolvePageConfigFromRequest(makeRequest(undefined, { '/check-your-answers': {} }))).toEqual({})
    expect(resolvePageConfigFromRequest(undefined)).toEqual({})
  })
})

describe('#pageSubmitButtonText', () => {
  const makeRequest = (pathParam, pageConfig) => ({
    params: { path: pathParam },
    app: { model: { def: { metadata: { pageConfig } } } }
  })

  test('returns the page-level submit button text when set', () => {
    const request = makeRequest('check-your-answers', {
      '/check-your-answers': { submitButtonText: 'Agree and submit' }
    })
    expect(pageSubmitButtonText(request)).toBe('Agree and submit')
  })

  test('returns undefined when not set or empty', () => {
    expect(pageSubmitButtonText(makeRequest('check-your-answers', { '/check-your-answers': {} }))).toBeUndefined()
    expect(
      pageSubmitButtonText(makeRequest('check-your-answers', { '/check-your-answers': { submitButtonText: '' } }))
    ).toBeUndefined()
    expect(pageSubmitButtonText(undefined)).toBeUndefined()
  })
})

describe('#pageHideBackLink', () => {
  const makePage = (path, pageConfig) => ({ path, def: { metadata: { pageConfig } } })

  test('returns true only when hideBackLink is explicitly true', () => {
    expect(pageHideBackLink(makePage('/p', { '/p': { hideBackLink: true } }))).toBe(true)
  })

  test('returns false for falsy, missing or non-boolean values', () => {
    expect(pageHideBackLink(makePage('/p', { '/p': { hideBackLink: false } }))).toBe(false)
    expect(pageHideBackLink(makePage('/p', { '/p': { hideBackLink: 'true' } }))).toBe(false)
    expect(pageHideBackLink(makePage('/p', { '/p': {} }))).toBe(false)
    expect(pageHideBackLink()).toBe(false)
  })
})

describe('#pageRpaDetails', () => {
  const makePage = (path, pageConfig) => ({
    path,
    def: { metadata: { pageConfig } }
  })

  test('returns the title and HTML content when both are configured', () => {
    const page = makePage('/p', {
      '/p': { rpaDetails: { title: 'If you need help', content: '<p>Contact us</p>' } }
    })
    expect(pageRpaDetails(page)).toEqual({ title: 'If you need help', content: '<p>Contact us</p>' })
  })

  test('returns null when title or content is missing', () => {
    expect(pageRpaDetails(makePage('/p', { '/p': { rpaDetails: { title: 'If you need help' } } }))).toBeNull()
    expect(pageRpaDetails(makePage('/p', { '/p': { rpaDetails: { content: '<p>Contact us</p>' } } }))).toBeNull()
  })

  test('returns null when rpaDetails is missing or not an object', () => {
    expect(pageRpaDetails(makePage('/p', { '/p': {} }))).toBeNull()
    expect(pageRpaDetails(makePage('/p', { '/p': { rpaDetails: 'help' } }))).toBeNull()
    expect(pageRpaDetails()).toBeNull()
  })
})

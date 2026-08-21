import { config } from '~/src/config/config.js'
import { mockGrantRequest } from '~/src/__mocks__/hapi-mocks.js'
import { buildFeedbackSurveyUrl, resolveJourney, JOURNEY } from '~/src/server/common/helpers/feedback-survey.js'

const BASE_URL = 'https://defragroup.eu.qualtrics.com/jfe/form/SV_test'

/**
 * @param {{ slug?: string, path?: string, href?: string }} [options]
 * @param {string} [surveyLabel]
 */
const mockSurveyRequest = (options, surveyLabel) => ({
  ...mockGrantRequest(options),
  app: { model: { def: { metadata: { surveyLabel } } } }
})

describe('#resolveJourney', () => {
  test.each([
    ['/woodland/confirmation', JOURNEY.submitted],
    ['/woodland/print-submitted-application', JOURNEY.submitted],
    ['/woodland/claim', JOURNEY.claimInProgress],
    ['/woodland/claim-declaration', JOURNEY.claimInProgress],
    ['/woodland/claim-confirmation', JOURNEY.claimSubmitted],
    ['/woodland/summary', JOURNEY.inProgress],
    [undefined, JOURNEY.inProgress]
  ])('resolves %s to %s', (path, expected) => {
    expect(resolveJourney(path)).toBe(expected)
  })
})

describe('#buildFeedbackSurveyUrl', () => {
  beforeEach(() => {
    config.set('feedback.surveyUrl', BASE_URL)
  })

  afterEach(() => {
    config.set('feedback.surveyUrl', '')
  })

  test('builds URL with grant, journey and url params using the form definition survey label', () => {
    const result = buildFeedbackSurveyUrl(
      mockSurveyRequest({ slug: 'woodland', path: '/woodland/summary' }, 'Woodland Management Plan')
    )
    const url = new URL(/** @type {string} */ (result))

    expect(url.origin + url.pathname).toBe(BASE_URL)
    expect(url.searchParams.get('grant')).toBe('Woodland Management Plan')
    expect(url.searchParams.get('journey')).toBe(JOURNEY.inProgress)
    expect(url.searchParams.get('url')).toBe('https://grants.example/woodland/summary')
  })

  test('falls back to https protocol and host when request.url, server and path are absent', () => {
    const result = buildFeedbackSurveyUrl({
      params: { slug: 'woodland' },
      info: { host: 'grants.example' }
    })
    const url = new URL(/** @type {string} */ (result))
    expect(url.searchParams.get('url')).toBe('https://grants.example')
  })

  test('uses submitted journey on the confirmation page', () => {
    const result = buildFeedbackSurveyUrl(mockGrantRequest({ slug: 'woodland', path: '/woodland/confirmation' }))
    const url = new URL(/** @type {string} */ (result))
    expect(url.searchParams.get('journey')).toBe(JOURNEY.submitted)
  })

  test.each([
    ['/woodland/claim', JOURNEY.claimInProgress],
    ['/woodland/claim-confirmation', JOURNEY.claimSubmitted]
  ])('uses %s for a Woodland Management Plan claim', (path, journey) => {
    const result = buildFeedbackSurveyUrl(mockSurveyRequest({ slug: 'woodland', path }, 'Woodland Management Plan'))
    const url = new URL(/** @type {string} */ (result))

    expect(url.searchParams.get('grant')).toBe('Woodland Management Plan')
    expect(url.searchParams.get('journey')).toBe(journey)
    expect(url.searchParams.get('url')).toBe(`https://grants.example${path}`)
  })

  test.each([
    ['/example-grant-with-auth/claim', JOURNEY.claimInProgress],
    ['/example-grant-with-auth/claim-confirmation', JOURNEY.claimSubmitted]
  ])('uses %s for the authenticated example grant claim', (path, journey) => {
    const result = buildFeedbackSurveyUrl(
      mockSurveyRequest({ slug: 'example-grant-with-auth', path }, 'Example Grant with Auth')
    )
    const url = new URL(/** @type {string} */ (result))

    expect(url.searchParams.get('grant')).toBe('Example Grant with Auth')
    expect(url.searchParams.get('journey')).toBe(journey)
    expect(url.searchParams.get('url')).toBe(`https://grants.example${path}`)
  })

  test('falls back to the sentence-cased form definition filename when surveyLabel is absent', () => {
    const result = buildFeedbackSurveyUrl(
      mockGrantRequest({ slug: 'example-grant-with-auth', path: '/example-grant-with-auth/start' })
    )

    expect(new URL(/** @type {string} */ (result)).searchParams.get('grant')).toBe('Example grant with auth')
  })

  test('returns null when no slug is present', () => {
    expect(buildFeedbackSurveyUrl({ path: '/', params: {} })).toBeNull()
  })

  test('returns null when survey URL is not configured', () => {
    config.set('feedback.surveyUrl', '')
    expect(buildFeedbackSurveyUrl(mockGrantRequest())).toBeNull()
  })

  test('returns null for an undefined request', () => {
    expect(buildFeedbackSurveyUrl(undefined)).toBeNull()
  })

  test('appends params with & when base URL already has a query string', () => {
    config.set('feedback.surveyUrl', `${BASE_URL}?existing=1`)
    const result = /** @type {string} */ (
      buildFeedbackSurveyUrl(mockSurveyRequest(undefined, 'Woodland Management Plan'))
    )
    expect(result.startsWith(`${BASE_URL}?existing=1&`)).toBe(true)
    const url = new URL(result)
    expect(url.searchParams.get('existing')).toBe('1')
    expect(url.searchParams.get('grant')).toBe('Woodland Management Plan')
  })
})

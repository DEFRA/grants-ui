import { config } from '~/src/config/config.js'
import { mockGrantRequest } from '~/src/__mocks__/hapi-mocks.js'
import {
  buildFeedbackSurveyUrl,
  resolveJourney,
  JOURNEY,
  SCHEME_LABELS
} from '~/src/server/common/helpers/feedback-survey.js'

const BASE_URL = 'https://defragroup.eu.qualtrics.com/jfe/form/SV_test'

/**
 * Literal — deliberately not derived from SCHEME_LABELS, so the allowlist
 * assertion below still catches a slug added to the source by mistake.
 * @type {Array<[string, string]>}
 */
const SLUG_LABELS = [
  ['farm-payments', 'Farm Payments'],
  ['woodland', 'Woodland Management Plan'],
  ['grasslands', 'Grasslands'],
  ['example-grant-with-auth', 'Example Grant with Auth']
]

describe('#resolveJourney', () => {
  test.each([
    ['/woodland/confirmation', JOURNEY.submitted],
    ['/woodland/print-submitted-application', JOURNEY.submitted],
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

  test('builds URL with grant, journey and url params for an in-scope grant', () => {
    const result = buildFeedbackSurveyUrl(mockGrantRequest({ slug: 'woodland', path: '/woodland/summary' }))
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

  test.each(SLUG_LABELS)('sends the grant label for slug %s as %s', (slug, label) => {
    const result = buildFeedbackSurveyUrl(mockGrantRequest({ slug, path: `/${slug}/start` }))
    expect(new URL(/** @type {string} */ (result)).searchParams.get('grant')).toBe(label)
  })

  test('returns null for an out-of-scope grant (gating)', () => {
    expect(
      buildFeedbackSurveyUrl(mockGrantRequest({ slug: 'some-other-grant', path: '/some-other-grant/summary' }))
    ).toBeNull()
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
    const result = /** @type {string} */ (buildFeedbackSurveyUrl(mockGrantRequest()))
    expect(result.startsWith(`${BASE_URL}?existing=1&`)).toBe(true)
    const url = new URL(result)
    expect(url.searchParams.get('existing')).toBe('1')
    expect(url.searchParams.get('grant')).toBe('Woodland Management Plan')
  })

  test('scope allowlist keys map to their exact labels', () => {
    expect(SCHEME_LABELS).toEqual(Object.fromEntries(SLUG_LABELS))
  })
})

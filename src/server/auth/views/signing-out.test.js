import { createPageRenderer } from '~/src/server/common/test-helpers/component-helpers.js'

const renderPage = createPageRenderer(import.meta.url, 'signing-out.njk')

const form = {
  endpoint: 'https://defra-id.example/signout',
  fields: {
    post_logout_redirect_uri: 'https://grants-ui.example.com/auth/sign-out-oidc',
    id_token_hint: 'eyJhbGciOi.payload.sig',
    state: 'abc&def'
  }
}
const signOutUrl = `${form.endpoint}?post_logout_redirect_uri=${form.fields.post_logout_redirect_uri}&id_token_hint=${form.fields.id_token_hint}&state=${form.fields.state}`

const sentence = ($) => $('main p').text().replace(/\s+/g, ' ').replace(' .', '.').trim()

describe('signing-out.njk', () => {
  test('posts the end-session request to Defra ID with the documented fields', () => {
    const $ = renderPage({ form, signOutUrl, cspNonce: 'n0nce' })

    const $form = $('form#defra-id-sign-out')
    expect($form.attr('method')).toBe('post')
    expect($form.attr('action')).toBe(form.endpoint)
    for (const [name, value] of Object.entries(form.fields)) {
      expect($form.find(`input[type="hidden"][name="${name}"]`).attr('value')).toBe(value)
    }
    expect($('meta[http-equiv="refresh"]')).toHaveLength(0)
    expect($('script[nonce="n0nce"]').text()).toContain("getElementById('defra-id-sign-out').submit()")
  })

  test('shows the Defra ID wording with the GET URL as the manual fallback link', () => {
    const $ = renderPage({ form, signOutUrl, cspNonce: 'n0nce' })

    expect($('main h1').text().trim()).toBe('Signing you out')
    expect(sentence($)).toBe('Please wait while we sign you out. If you are not redirected in 5 seconds click here.')
    expect($('main p a.govuk-link').attr('href')).toBe(signOutUrl)
  })

  test('falls back to an instant GET meta refresh when there is no form (stub environments)', () => {
    const $ = renderPage({ signOutUrl })

    expect($('meta[http-equiv="refresh"]').attr('content')).toBe(`0; url=${signOutUrl}`)
    expect($('main p a.govuk-link').attr('href')).toBe(signOutUrl)
    expect($('form#defra-id-sign-out')).toHaveLength(0)
    expect($('script').filter((_, el) => $(el).text().includes('defra-id-sign-out'))).toHaveLength(0)
  })

  test('renders without the phase banner and account bar, like a transition page', () => {
    const $ = renderPage({ form, signOutUrl, feedbackSurveyUrl: 'https://survey.example', auth: { name: 'A User' } })

    expect($('.govuk-phase-banner')).toHaveLength(0)
    expect($('.defra-account-bar')).toHaveLength(0)
    expect($('.govuk-service-navigation')).toHaveLength(1)
  })
})

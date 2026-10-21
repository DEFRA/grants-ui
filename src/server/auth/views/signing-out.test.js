import { createPageRenderer } from '~/src/server/common/test-helpers/component-helpers.js'

const renderPage = createPageRenderer(import.meta.url, 'signing-out.njk')

const form = {
  endpoint: 'https://defra-id.example/signout',
  fields: {
    post_logout_redirect_uri: 'https://app.example/auth/sign-out-oidc',
    id_token_hint: 'eyJhbGciOi.payload.sig',
    state: 'abc&def'
  }
}

describe('signing-out.njk', () => {
  test('posts the end-session request to Defra ID with the documented fields', () => {
    const $ = renderPage({ form, cspNonce: 'n0nce' })

    const $form = $('form#defra-id-sign-out')
    expect($form.attr('method')).toBe('post')
    expect($form.attr('action')).toBe(form.endpoint)
    for (const [name, value] of Object.entries(form.fields)) {
      expect($form.find(`input[type="hidden"][name="${name}"]`).attr('value')).toBe(value)
    }
  })

  test('falls back to an instant GET meta refresh with a link when given a URL (stub environments)', () => {
    const signOutUrl =
      'https://stub.example/signout?post_logout_redirect_uri=https://app.example/cb&id_token_hint=tok&state=abc'
    const $ = renderPage({ signOutUrl })

    expect($('meta[http-equiv="refresh"]').attr('content')).toBe(`0; url=${signOutUrl}`)
    expect($('main a.govuk-link').attr('href')).toBe(signOutUrl)
    expect($('form#defra-id-sign-out')).toHaveLength(0)
    expect($('script').filter((_, el) => $(el).text().includes('defra-id-sign-out'))).toHaveLength(0)
  })

  test('submits itself on load and offers a button for users without JavaScript', () => {
    const $ = renderPage({ form, cspNonce: 'n0nce' })

    expect($('script[nonce="n0nce"]').text()).toContain("getElementById('defra-id-sign-out').submit()")
    expect($('main h1').text().trim()).toBe('Signing you out')
    expect($('form#defra-id-sign-out button').text().trim()).toBe('Continue signing out')
  })
})

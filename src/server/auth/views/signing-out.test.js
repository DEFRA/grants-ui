import { createPageRenderer } from '~/src/server/common/test-helpers/component-helpers.js'

const renderPage = createPageRenderer(import.meta.url, 'signing-out.njk')

const signOutUrl =
  'https://defra-id.example/signout?post_logout_redirect_uri=https://app.example/auth/sign-out-oidc&id_token_hint=eyJhbGciOi.payload.sig&state=abc'

describe('signing-out.njk', () => {
  test('sends the browser straight to the Defra ID sign-out URL via meta refresh', () => {
    const $ = renderPage({ signOutUrl })

    expect($('meta[http-equiv="refresh"]').attr('content')).toBe(`0; url=${signOutUrl}`)
  })

  test('offers the sign-out URL as a fallback link', () => {
    const $ = renderPage({ signOutUrl })

    expect($('main h1').text().trim()).toBe('Signing you out')
    expect($('main a.govuk-link').attr('href')).toBe(signOutUrl)
  })
})

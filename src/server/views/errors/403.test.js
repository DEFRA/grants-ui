import { createPageRenderer } from '~/src/server/common/test-helpers/component-helpers.js'

const renderPage = createPageRenderer(import.meta.url, '403.njk', {}, ['src/server/views'])

const normaliseText = (element) => element.text().replace(/\s+/g, ' ').trim()

describe('403.njk', () => {
  test('directs the user to their business before the existing RPA contact details', () => {
    const $ = renderPage()

    expect($('main h1').text().trim()).toBe('You do not have permission to view this page')
    expect(normaliseText($('main ul.govuk-list'))).toContain(
      'contact a person in your business with the correct permission level to update your access'
    )
    expect($('main h2').text().trim()).toBe('If you still need help')
    expect(normaliseText($('main'))).toContain(
      'If your business has confirmed you have the correct permission level, contact the Rural Payments Agency (RPA) by phone or email for support.'
    )
    expect(normaliseText($('main'))).toContain('Telephone: 03000 200 301')
    expect($('main a[href="mailto:ruralpayments@defra.gov.uk"]').text().trim()).toBe('ruralpayments@defra.gov.uk')
  })

  test('links to the Rural Payments permissions guidance', () => {
    const $ = renderPage()
    const guidanceLink = $(
      'main a[href="https://www.gov.uk/guidance/rural-payments-service-give-or-update-permissions"]'
    )

    expect(guidanceLink).toHaveLength(1)
    expect(guidanceLink.text().trim()).toBe('guidance on giving or updating permissions on the Rural Payments service')
  })
})

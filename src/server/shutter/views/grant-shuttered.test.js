import { createPageRenderer } from '~/src/server/common/test-helpers/component-helpers.js'

const renderPage = createPageRenderer(import.meta.url, 'grant-shuttered.njk', {
  grantName: 'Woodland Management Plan',
  falsUrl: '/'
})

const normaliseText = (element) => element.text().replace(/\s+/g, ' ').trim()

describe('grant-shuttered.njk', () => {
  test('names the grant, says it is unavailable and gives the same RPA contact details as the platform shutter page', () => {
    const $ = renderPage()

    expect($('main .govuk-caption-l').text().trim()).toBe('Woodland Management Plan')
    expect($('main h1').text().trim()).toBe('Sorry, this grant is unavailable')
    expect(normaliseText($('main'))).toContain(
      'Contact the Rural Payments Agency (RPA) if you need help with your application. Email: ruralpayments@defra.gov.uk The RPA responds to email queries within 10 working days.'
    )
    expect($('main a[href="mailto:ruralpayments@defra.gov.uk"]')).toHaveLength(1)
  })

  test('leaves out the caption when the grant name is not known', () => {
    const $ = renderPage({ grantName: undefined })

    expect($('main .govuk-caption-l')).toHaveLength(0)
    expect($('main h1').text().trim()).toBe('Sorry, this grant is unavailable')
  })

  test('renders the configured HTML, including links', () => {
    const $ = renderPage({
      html: '<p class="govuk-body" id="shutter-html">Back on <a href="https://example.gov.uk">Monday</a>.</p>'
    })

    expect($('#shutter-html a[href="https://example.gov.uk"]').text()).toBe('Monday')
  })

  test('adds no paragraph when no HTML is configured', () => {
    const $ = renderPage()

    expect($('main h1').next().text().trim()).toBe(
      'Contact the Rural Payments Agency (RPA) if you need help with your application.'
    )
  })

  test('links to the Farm and Land Service after the contact details', () => {
    const $ = renderPage({ falsUrl: 'https://sfd.example/home?ssoOrgId=REL123' })
    const link = $('main a[href="https://sfd.example/home?ssoOrgId=REL123"]')

    expect(link.text().trim()).toBe('Go to the Farm and Land Service')
    expect($('main p').last().find('a').attr('href')).toBe('https://sfd.example/home?ssoOrgId=REL123')
  })
})

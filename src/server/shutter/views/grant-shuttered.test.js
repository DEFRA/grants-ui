import { createPageRenderer } from '~/src/server/common/test-helpers/component-helpers.js'

const renderPage = createPageRenderer(import.meta.url, 'grant-shuttered.njk', {
  grantName: 'Woodland Management Plan',
  falsUrl: '/'
})

const normaliseText = (element) => element.text().replace(/\s+/g, ' ').trim()

describe('grant-shuttered.njk', () => {
  test('says the named grant is unavailable and gives the RPA contact details under Getting help', () => {
    const $ = renderPage()

    expect($('main h1').text().trim()).toBe('Sorry, Woodland Management Plan is unavailable')
    expect($('title').text()).toContain('Sorry, Woodland Management Plan is unavailable')
    expect(normaliseText($('main'))).toContain(
      'Getting help Contact the Rural Payments Agency (RPA) if you need help with your application. Email: ruralpayments@defra.gov.uk The RPA responds to email queries within 10 working days.'
    )
    expect($('main a[href="mailto:ruralpayments@defra.gov.uk"]')).toHaveLength(1)
  })

  test('falls back to "this grant" when the grant name is not known', () => {
    const $ = renderPage({ grantName: undefined })

    expect($('main h1').text().trim()).toBe('Sorry, this grant is unavailable')
  })

  test('renders the configured HTML, including links, above Getting help', () => {
    const $ = renderPage({
      html: '<p class="govuk-body" id="shutter-html">Back on <a href="https://example.gov.uk">Monday</a>.</p>'
    })

    expect($('#shutter-html a[href="https://example.gov.uk"]').text()).toBe('Monday')
    expect($('#shutter-html').next().text().trim()).toBe('Getting help')
  })

  test('adds no paragraph when no HTML is configured', () => {
    const $ = renderPage()

    expect($('main h1').next().text().trim()).toBe('Getting help')
  })

  test('links to the Farm and Land Service after the contact details', () => {
    const $ = renderPage({ falsUrl: 'https://sfd.example/home?ssoOrgId=REL123' })
    const lastParagraph = $('main p').last()

    expect(normaliseText(lastParagraph)).toBe('For other grants and schemes, visit the Farm and Land service')
    expect(lastParagraph.find('a').attr('href')).toBe('https://sfd.example/home?ssoOrgId=REL123')
    expect(lastParagraph.find('a').text().trim()).toBe('Farm and Land service')
  })
})

import { createPageRenderer } from '~/src/server/common/test-helpers/component-helpers.js'

const renderPage = createPageRenderer(import.meta.url, 'check-details.html', {
  pageTitle: 'Check your details',
  components: [],
  sections: [],
  page: { def: { metadata: {} } }
})

const makePage = (pageConfig) => ({ path: '/check-details', def: { metadata: { pageConfig } } })

describe('check-details.html view', () => {
  it('should render the SFD update link as the alternate action', () => {
    const sfdUpdateDetailsUrl = '/test-grant/check-details?updateDetailsOnSfd=true'
    const $ = renderPage({ sfdUpdateDetailsUrl })

    expect($('form.check-details-form--sfd')).toHaveLength(1)
    expect($('.check-details-form__submit .govuk-button').text().trim()).toBe('Continue')
    expect($(`a.check-details-form__sfd-link[href="${sfdUpdateDetailsUrl}"]`).text().trim()).toBe('Continue')
  })

  describe('rpaDetails', () => {
    it('does not render the RPA details when not configured', () => {
      const $ = renderPage({ page: makePage({ '/check-details': {} }) })
      expect($('.govuk-details__summary-text')).toHaveLength(0)
    })

    it('renders a GDS details component with the title in the summary and the HTML content as the text', () => {
      const $ = renderPage({
        page: makePage({
          '/check-details': {
            rpaDetails: {
              title: 'If you need help with your claim',
              content:
                '<p class="govuk-body">Email <a href="mailto:ruralpayments@defra.gov.uk">ruralpayments@defra.gov.uk</a></p>'
            }
          }
        })
      })

      expect($('.govuk-details__summary-text').text().trim()).toBe('If you need help with your claim')
      expect($('.govuk-details__text a[href="mailto:ruralpayments@defra.gov.uk"]').text()).toBe(
        'ruralpayments@defra.gov.uk'
      )
    })

    it('does not render the RPA details when only the title is configured', () => {
      const $ = renderPage({ page: makePage({ '/check-details': { rpaDetails: { title: 'If you need help' } } }) })
      expect($('.govuk-details__summary-text')).toHaveLength(0)
    })
  })
})

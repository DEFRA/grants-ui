import { createPageRenderer } from '~/src/server/common/test-helpers/component-helpers.js'

const renderPage = createPageRenderer(import.meta.url, 'check-details.html', {
  pageTitle: 'Check your details',
  components: [],
  sections: [],
  page: { def: { metadata: {} } }
})

describe('check-details.html view', () => {
  it('should render the SFD update link as the alternate action', () => {
    const sfdUpdateDetailsUrl = '/test-grant/check-details?updateDetailsOnSfd=true'
    const $ = renderPage({ sfdUpdateDetailsUrl })

    expect($('form.check-details-form--sfd')).toHaveLength(1)
    expect($('.check-details-form__submit .govuk-button').text().trim()).toBe('Continue')
    expect($(`a.check-details-form__sfd-link[href="${sfdUpdateDetailsUrl}"]`).text().trim()).toBe('Continue')
  })
})

import { createPageRenderer } from '~/src/server/common/test-helpers/component-helpers.js'

const render = createPageRenderer(import.meta.url, 'confirmation-page.html', {
  referenceNumber: 'REF-1',
  confirmationContent: {}
})

describe('confirmation page manage applications link', () => {
  it('shows a link and bulleted list instead of the start button', () => {
    const $ = render({ startAnotherApplicationUrl: '/test-grant/applications' })

    expect($('main button').length).toBe(0)
    expect($('main').text()).not.toContain('Start a new application')
    expect($('main form').length).toBe(0)

    const link = $('main a:contains("manage your applications")')
    expect(link.attr('href')).toBe('/test-grant/applications')
    expect(
      $('main ul.govuk-list--bullet')
        .last()
        .find('li')
        .map((_, item) => $(item).text().trim())
        .get()
    ).toEqual(['view this and other applications', 'start a new application', 'continue working on draft applications'])
  })

  it('shows neither the link nor the button without a start URL', () => {
    const $ = render({ startAnotherApplicationUrl: undefined })

    expect($('main a:contains("manage your applications")').length).toBe(0)
    expect($('main button').length).toBe(0)
    expect($('main').text()).not.toContain('Start a new application')
  })
})

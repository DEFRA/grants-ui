import { createPageRenderer } from '~/src/server/common/test-helpers/component-helpers.js'

describe.each(['incorrect-details.njk', 'incorrect-details.html'])('%s view', (template) => {
  const renderPage = createPageRenderer(import.meta.url, template, { pageTitle: 'Update your details' })

  it('should use meta refresh as the primary SFD redirect and an anchor as fallback', () => {
    const sfdUpdateUrl = 'https://sfd.example/update?source=grants&ssoOrgId=REL123'
    const $ = renderPage({
      sfdUpdateUrl,
      incorrectDetailsContent: {
        heading: 'Incorrect details content',
        paragraphs: ['This must not be displayed'],
        showRpaSupport: true
      },
      supportEmail: 'support@example.com'
    })

    expect($('head meta[http-equiv="refresh"]').attr('content')).toBe(`0; url=${sfdUpdateUrl}`)
    expect($('main a[href="https://sfd.example/update?source=grants&ssoOrgId=REL123"]').text().trim()).toBe(
      'Update details'
    )
    expect($('main a')).toHaveLength(1)
    expect($('main form')).toHaveLength(0)
    expect($('main').text()).not.toContain('Incorrect details content')
    expect($('main').text()).not.toContain('This must not be displayed')
    expect($('main').text()).not.toContain('Contact the Rural Payments Agency')
  })

  it('should preserve the existing incorrect-details content when no SFD URL is provided', () => {
    const $ = renderPage({
      sfdUpdateUrl: null,
      incorrectDetailsContent: {
        heading: 'Update needed',
        paragraphs: ['Contact us to update your details.'],
        showRpaSupport: false
      }
    })

    expect($('head meta[http-equiv="refresh"]')).toHaveLength(0)
    expect($('main h1').text().trim()).toBe('Update needed')
    expect($('main').text()).toContain('Contact us to update your details.')
    expect($('main a').filter((_, element) => $(element).text().trim() === 'Update details')).toHaveLength(0)
  })
})

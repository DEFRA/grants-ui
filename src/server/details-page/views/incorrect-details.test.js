import { createPageRenderer } from '~/src/server/common/test-helpers/component-helpers.js'

describe.each(['incorrect-details.njk', 'incorrect-details.html'])('%s view', (template) => {
  const renderPage = createPageRenderer(import.meta.url, template, { pageTitle: 'Update your details' })

  it('should render the incorrect-details content (the SFD redirect happens server-side, before this view is ever rendered)', () => {
    const $ = renderPage({
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

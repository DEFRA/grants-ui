import { createPageRenderer } from '~/src/server/common/test-helpers/component-helpers.js'

const renderPage = createPageRenderer(import.meta.url, 'home.njk')

describe('home.njk', () => {
  test('renders linked grants and their optional descriptions', () => {
    const $ = renderPage({
      organisationName: 'Test Farm',
      grants: [
        { title: 'Farm payments', description: 'Apply for farm payments.', href: '/farm-payments' },
        { title: 'Woodland grant', description: null, href: '/woodland' }
      ]
    })

    expect($('h1').text().trim()).toBe('Grants available to you')
    expect($('.govuk-body').first().text().replace(/\s+/g, ' ').trim()).toBe(
      'Select a grant to start or continue an application for Test Farm.'
    )
    expect($('a[href="/farm-payments"]').text().trim()).toBe('Farm payments')
    expect($('a[href="/woodland"]').text().trim()).toBe('Woodland grant')
    expect($.root().text()).toContain('Apply for farm payments.')
    expect($.root().text()).not.toContain('Your session details')
  })

  test('renders guidance when no grants are available', () => {
    const $ = renderPage({ grants: [] })

    expect($('.govuk-body').text().trim()).toBe('You do not currently have access to any active grant services.')
    expect($('main ul.govuk-list')).toHaveLength(0)
  })
})

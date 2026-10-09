import { createPageRenderer } from '~/src/server/common/test-helpers/component-helpers.js'

const render = createPageRenderer(import.meta.url, 'applications.njk', {
  pageTitle: 'Your Water Management grant applications',
  schemeName: 'Water Management grant',
  supportEmail: 'ruralpayments@defra.gov.uk',
  canStartApplication: true,
  applications: [
    {
      referenceNumber: 'REF-DRAFT',
      createdAt: '2026-10-02T12:00:00Z',
      submittedAt: null,
      statusText: 'Draft',
      statusClasses: 'govuk-tag--red',
      actionText: 'Continue application',
      href: '/test-grant?ref=REF-DRAFT'
    },
    {
      referenceNumber: 'REF-SUBMITTED',
      createdAt: '2026-08-14T12:00:00Z',
      submittedAt: '2026-08-15T12:00:00Z',
      statusText: 'Submitted',
      statusClasses: 'govuk-tag--green',
      actionText: 'View application',
      href: '/test-grant/print-submitted-application?ref=REF-SUBMITTED'
    }
  ]
})

it('renders separate creation and submission dates and coloured status tags', () => {
  const $ = render()
  expect($('main h1').text().trim()).toBe('Your Water Management grant applications')
  expect(
    $('thead th')
      .map((_, cell) => $(cell).text().trim())
      .get()
  ).toEqual(['Reference number', 'Date created', 'Date submitted', 'Status', 'Action'])
  const draft = $('tbody tr').eq(0)
  expect(draft.find('td').eq(0).text().trim()).toBe('2 October 2026')
  expect(draft.find('td').eq(1).text().trim()).toBe('—')
  expect(draft.find('.govuk-tag--red').text().trim()).toBe('Draft')
  const submitted = $('tbody tr').eq(1)
  expect(submitted.find('td').eq(0).text().trim()).toBe('14 August 2026')
  expect(submitted.find('td').eq(1).text().trim()).toBe('15 August 2026')
  expect(submitted.find('.govuk-tag--green').text().trim()).toBe('Submitted')
  expect(submitted.find('a').attr('href')).toBe('/test-grant/print-submitted-application?ref=REF-SUBMITTED')
  expect(submitted.find('a').attr('target')).toBeUndefined()
})

it('reuses expandable RPA contact details and retains the protected creation form', () => {
  const $ = render()
  expect($('.govuk-details__summary-text').text().trim()).toBe('If you have a question about your application')
  expect($('.govuk-details__text').text()).toContain('03000 200 301')
  expect($('.govuk-details a[href="mailto:ruralpayments@defra.gov.uk"]').length).toBe(1)
  expect($('.govuk-details a[href="https://www.gov.uk/call-charges"]').length).toBe(1)
  expect($('main form[method="post"] input[name="crumb"]').val()).toBe('test-crumb')
  expect($('main form button').text().trim()).toBe('Start a new application')
})

it('keeps support available when there are no applications and the window is closed', () => {
  const $ = render({ applications: [], canStartApplication: false })
  expect($('main').text()).toContain('You have no applications for this grant.')
  expect($('.govuk-details').length).toBe(1)
  expect($('main form').length).toBe(0)
})

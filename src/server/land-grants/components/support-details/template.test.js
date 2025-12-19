import { createComponentRenderer } from '~/src/server/common/test-helpers/component-helpers.js'

const renderSupportDetails = createComponentRenderer(import.meta.url, 'defraSupportDetails')

describe('Support Details Component', () => {
  const supportTypeTests = [
    {
      name: 'question',
      typeOfSupport: 'question',
      expectedSummary: 'If you have a question',
      expectedIntro: 'Contact the Rural Payments Agency (RPA) if you have a query.'
    },
    {
      name: 'update',
      typeOfSupport: 'update',
      expectedSummary: 'If you need to make an update',
      expectedIntro: 'Contact the Rural Payments Agency (RPA) to update your details.'
    }
  ]

  describe.each(supportTypeTests)(
    'when typeOfSupport is "$name"',
    ({ typeOfSupport, expectedSummary, expectedIntro }) => {
      let $component

      beforeEach(() => {
        $component = renderSupportDetails({ typeOfSupport })
      })

      test('should render correct summary text', () => {
        expect($component('.govuk-details__summary-text').text().trim()).toBe(expectedSummary)
      })

      test('should render correct intro text', () => {
        expect($component('.govuk-details__text').text()).toContain(expectedIntro)
      })
    }
  )

  describe('common content', () => {
    let $component

    beforeEach(() => {
      $component = renderSupportDetails({ typeOfSupport: 'question' })
    })

    const contactInfoTests = [
      {
        name: 'RPA telephone number',
        selector: 'a[href="tel:03000200301"]',
        expectedText: '03000 200 301'
      },
      {
        name: 'RPA email address',
        selector: 'a[href="mailto:farmpayments@rpa.gov.uk"]',
        expectedText: 'farmpayments@rpa.gov.uk'
      }
    ]

    test.each(contactInfoTests)('should include $name', ({ selector, expectedText }) => {
      expect($component(selector).text()).toBe(expectedText)
    })

    const staticContentTests = [
      { name: 'call charges link', selector: 'a[href="https://www.gov.uk/call-charges"]' },
      { name: 'opening hours', text: 'Monday to Friday, 8:30am to 5pm (except bank holidays)' },
      { name: 'response time', text: 'The RPA responds to email queries within 10 working days.' }
    ]

    test.each(staticContentTests)('should include $name', ({ selector, text }) => {
      if (selector) {
        expect($component(selector)).toHaveLength(1)
      } else {
        expect($component('.govuk-details__text').text()).toContain(text)
      }
    })
  })
})

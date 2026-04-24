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

  describe('common content (default template)', () => {
    let $component

    beforeEach(() => {
      $component = renderSupportDetails({ typeOfSupport: 'question' })
    })

    const contactInfoTests = [
      {
        name: 'RPA telephone number',
        selector: '[data-type="telephone"]',
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
      {
        name: 'call charges link',
        selector: 'a[href="https://www.gov.uk/call-charges"]'
      },
      {
        name: 'opening hours',
        text: 'Monday to Friday, 8:30am to 5pm'
      },
      {
        name: 'response time',
        text: '10 working days'
      }
    ]

    test.each(staticContentTests)('should include $name', ({ selector, text }) => {
      if (selector) {
        expect($component(selector)).toHaveLength(1)
      } else {
        expect($component('.govuk-details__text').text()).toContain(text)
      }
    })
  })

  describe('custom overrides', () => {
    test('should override summary text', () => {
      const $component = renderSupportDetails({
        summaryText: 'Get help with your application',
        html: '<p class="govuk-body">Custom content</p>'
      })

      expect($component('.govuk-details__summary-text').text().trim()).toBe('Get help with your application')
    })

    test('should override HTML content completely', () => {
      const $component = renderSupportDetails({
        summaryText: 'Get help',
        html: `
          <p class="govuk-body">Phone: 020 8026 2395</p>
          <p class="govuk-body">Custom support text</p>
        `
      })

      const text = $component('.govuk-details__text').text()

      expect(text).toContain('020 8026 2395')
      expect(text).toContain('Custom support text')
    })

    test('should NOT include default intro when html override is provided', () => {
      const $component = renderSupportDetails({
        typeOfSupport: 'question',
        html: '<p>Only custom</p>'
      })

      const text = $component('.govuk-details__text').text()

      expect(text).not.toContain('Contact the Rural Payments Agency')
      expect(text).toContain('Only custom')
    })
  })
})

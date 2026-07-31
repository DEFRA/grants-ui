import { createPageRenderer } from '~/src/server/common/test-helpers/component-helpers.js'
import { UNCONFIGURED_DEFAULTS } from '../declaration-page.controller.js'

const renderPage = createPageRenderer(import.meta.url, 'declaration-page.html', {
  pageTitle: 'Confirm and send',
  declarationContent: UNCONFIGURED_DEFAULTS
})

/** The bespoke woodland template this page replaces, kept until the config release lands */
const renderWoodland = createPageRenderer(import.meta.url, 'woodland-declaration-page.html', {}, [
  'src/server/woodland/views'
])

/** The copy a page opts in to once it declares any `config:` block */
const configured = {
  heading: 'Submit your application',
  buttonText: 'Confirm and submit',
  html: '<p class="govuk-body">Configured copy.</p>'
}

/** The woodland `config:` block as published to the config repo */
const woodlandConfig = {
  heading: 'Submit your application',
  buttonText: 'Confirm and submit',
  showSupportDetails: true,
  hiddenFields: {
    guidanceRead: 'true',
    includedAllEligibleWoodland: 'true',
    applicationConfirmation: 'true'
  },
  html: [
    '<p class="govuk-body">By submitting your application, you confirm that:</p>',
    '<ul class="govuk-list govuk-list--bullet">',
    '<li>the information you have provided is correct to the best of your knowledge</li>',
    '<li>you have read and understand the information in the <a href="https://www.gov.uk/government/publications/pa3-woodland-management-plan-2026" class="govuk-link" target="_blank">PA3: Woodland management plan 2026 guidance (opens in new tab)</a> about this application, and agree to the <a href="https://www.gov.uk/government/publications/capital-grants-agreements-terms-and-conditions-2026" class="govuk-link" target="_blank">Capital grants agreements: Terms and Conditions 2026 (opens in new tab)</a> for the duration of any Countryside Stewardship (CS) agreement subsequently offered to and accepted by you</li>',
    '<li>you are capable of fulfilling the obligations which will be required of you if your application is successful</li>',
    '<li>you agree to let any authorised person access the land and relevant records related to this application so they can inspect or audit them to verify the information you’ve provided to the Rural Payments Agency (RPA) and the Forestry Commission (FC), and to check that you are complying with this agreement</li>',
    '<li>you agree to disclose all information relevant to this application, provide any additional information as may be required by the RPA, field officers or auditors and co-operate with or take part in any economic, environmental or other monitoring and evaluation of the scheme (including any research and development studies) conducted by RPA or the FC or by anyone appointed by either of them for that purpose</li>',
    '</ul>'
  ].join('\n')
}

const mainText = ($) => $('main').text().replace(/\s+/g, ' ').trim()
const links = ($) =>
  $('main a')
    .map((_, el) => `${$(el).attr('href')}|${$(el).text().trim()}`)
    .get()
const hiddenFields = ($) =>
  $('main form input[type="hidden"]')
    .filter((_, el) => $(el).attr('name') !== 'crumb')
    .map((_, el) => `${$(el).attr('name')}=${$(el).attr('value')}`)
    .get()

describe('declaration-page.html view', () => {
  describe('unconfigured pages', () => {
    it('should render the built-in copy, consent, warning and footer, but no support details or hidden fields', () => {
      const $ = renderPage({ supportEmail: 'support@example.com' })

      expect($('main h1').text().trim()).toBe('Confirm and send')
      expect(mainText($)).toContain(
        'I confirm that, to the best of my knowledge, the details I have provided are correct.'
      )
      expect($('main h2').text()).toContain('Improving our schemes')
      expect($('main input[name="consentOptional"]')).toHaveLength(1)
      expect($('main .govuk-warning-text__text').text()).toContain(UNCONFIGURED_DEFAULTS.warningText)
      expect(mainText($)).toContain('is the data controller for personal data you give to RPA')
      expect($('main button').text().trim()).toBe('Confirm and send')
      expect(mainText($)).not.toContain('support@example.com')
      expect(hiddenFields($)).toHaveLength(0)
    })
  })

  describe('configured pages', () => {
    it('should render the configured heading, body copy and button text', () => {
      const $ = renderPage({
        declarationContent: {
          ...configured,
          html: '<p class="govuk-body">By submitting your application, you confirm that:</p><ul class="govuk-list govuk-list--bullet"><li>the information you have provided is correct</li><li>you have read the <a class="govuk-link" href="https://example.com/guidance" target="_blank">PA3 guidance (opens in new tab)</a> and agree to the <a class="govuk-link" href="https://example.com/terms" target="_blank">terms and conditions (opens in new tab)</a></li></ul>'
        }
      })

      expect($('main h1').text().trim()).toBe('Submit your application')
      expect(mainText($)).toContain('By submitting your application, you confirm that:')
      expect($('main li')).toHaveLength(2)
      expect(
        $('main li a')
          .map((_, el) => $(el).attr('href'))
          .get()
      ).toEqual(['https://example.com/guidance', 'https://example.com/terms'])
      expect($('main button').text().trim()).toBe('Confirm and submit')
    })

    it('should omit the built-in copy, consent checkbox, warning and data protection footer by default', () => {
      const $ = renderPage({ declarationContent: configured })

      expect(mainText($)).not.toContain('Improving our schemes')
      expect($('main input[name="consentOptional"]')).toHaveLength(0)
      expect($('main .govuk-warning-text')).toHaveLength(0)
      expect(mainText($)).not.toContain('is the data controller for personal data you give to RPA')
    })

    it('should render configured hidden fields inside the form', () => {
      const $ = renderPage({
        declarationContent: { ...configured, hiddenFields: woodlandConfig.hiddenFields }
      })

      expect(hiddenFields($)).toEqual([
        'guidanceRead=true',
        'includedAllEligibleWoodland=true',
        'applicationConfirmation=true'
      ])
    })

    it('should render support details when configured', () => {
      const $ = renderPage({
        supportEmail: 'ruralpayments@defra.gov.uk',
        declarationContent: { ...configured, showSupportDetails: true }
      })

      expect(mainText($)).toContain('ruralpayments@defra.gov.uk')
    })

    it('should render an opted-in warning and consent checkbox', () => {
      const $ = renderPage({
        declarationContent: {
          ...configured,
          warningText: 'You can only submit once.',
          optionalConsent: true,
          showDataProtection: true
        }
      })

      expect($('main .govuk-warning-text__text').text()).toContain('You can only submit once.')
      expect($('main input[name="consentOptional"]')).toHaveLength(1)
      expect(mainText($)).toContain('is the data controller for personal data you give to RPA')
    })

    it('should escape the section title but not the configured HTML', () => {
      const $ = renderPage({
        sectionTitle: 'Check & submit',
        declarationContent: { ...configured, html: '<p class="govuk-body">Trusted <strong>markup</strong>.</p>' }
      })

      expect($('main #section-title').text().trim()).toBe('Check & submit')
      expect($('main p strong').text()).toBe('markup')
    })

    it('should render any components the page declares', () => {
      const $ = renderPage({
        components: [{ type: 'Html', model: { content: '<p class="govuk-body">Component copy.</p>' } }],
        declarationContent: configured
      })

      expect(mainText($)).toContain('Component copy.')
    })
  })

  describe('parity with the bespoke grant templates', () => {
    const viewModel = {
      sectionTitle: 'Check and submit',
      pageTitle: 'Submit your application',
      supportEmail: 'ruralpayments@defra.gov.uk',
      page: { def: { metadata: { supportEmail: 'ruralpayments@defra.gov.uk' } } }
    }

    it('should reproduce the woodland declaration page from configuration alone', () => {
      const bespoke = renderWoodland(viewModel)
      const unified = renderPage({ ...viewModel, declarationContent: woodlandConfig })

      expect(mainText(unified)).toBe(mainText(bespoke))
      expect(links(unified)).toEqual(links(bespoke))
      expect(hiddenFields(unified)).toEqual(hiddenFields(bespoke))
    })
  })
})

// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { createPageRenderer } from '~/src/server/common/test-helpers/component-helpers.js'

const template = readFileSync(fileURLToPath(new URL('./map-select-parcel.html', import.meta.url)), 'utf8')
const renderPage = createPageRenderer(import.meta.url, 'map-select-parcel.html', {
  pageTitle: 'Select a land parcel',
  formAction: '/select-land-parcel'
})

const normalise = (text) => text.replace(/\s+/g, ' ').trim()

describe('map-select-parcel.html', () => {
  it('contains no inline <script> bodies (all JS lives in webpack entries)', () => {
    const bodies = [...template.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1].trim())
    expect(bodies).toEqual(bodies.map(() => ''))
  })

  it('loads the component and page-wiring bundles via getAssetPath', () => {
    expect(template).toContain("getAssetPath('parcel-map.js')")
    expect(template).toContain("getAssetPath('parcel-select-page.js')")
  })

  it('gives <parcel-map> a role so its aria-label is valid for assistive tech', () => {
    const openingTag = template.match(/<parcel-map\b[\s\S]*?>/)?.[0] ?? ''
    expect(openingTag).toContain('role="group"')
    expect(openingTag).toContain('aria-label="Land parcel selection map"')
  })

  it('passes enabled action codes to the map without adding an action-code content block', () => {
    const $ = renderPage({ enabledLandActions: ['CLIG3', 'CSAM3'] })

    expect($('#parcel-map').attr('data-enabled-land-actions')).toBe('CLIG3,CSAM3')
    expect($('[data-enabled-land-actions]').not('#parcel-map')).toHaveLength(0)
  })

  it('renders the Requirements row hidden, with an empty intro and bullet list', () => {
    const row = /<div\s+class="[^"]*"\s+id="selected-parcel-requirements-row"[^>]*>([\s\S]*?)<\/dd>/.exec(template)

    expect(row?.[0]).toContain('hidden')
    expect(row?.[0]).toContain('govuk-summary-list__row--no-actions')
    expect(row?.[1]).toContain('<dt class="govuk-summary-list__key">Requirements</dt>')
    expect(row?.[1]).toMatch(/id="selected-parcel-requirements-intro"\s*>\s*<\/p>/)
    expect(row?.[1]).toContain('govuk-list govuk-list--bullet')
    expect(row?.[1]).toMatch(/id="selected-parcel-requirements-list"\s*>\s*<\/ul>/)
  })

  it('places the live status region inside the summary block but outside the hidden row', () => {
    const details = /<div id="selected-parcel-details"[\s\S]*?<\/dl>([\s\S]*?)<\/div>/.exec(template)

    expect(details?.[1]).toContain(
      '<output id="selected-parcel-requirements-status" class="govuk-visually-hidden"></output>'
    )
  })

  it('renders the no-actions message hidden initially', () => {
    const $ = renderPage()
    const message = $('#summary-parcel-no-actions')

    expect(message.attr('hidden')).toBe('hidden')
    expect(normalise(message.text())).toBe(
      'There are no actions available for this land parcel. Select another land parcel to continue.'
    )
  })

  it('renders Cancel only when a cancel href is provided', () => {
    const standardPage = renderPage()
    const returnPage = renderPage({ cancelHref: '/test-grant/confirm-land-and-actions' })

    expect(standardPage('main a').filter((_, link) => normalise(standardPage(link).text()) === 'Cancel')).toHaveLength(
      0
    )
    const cancel = returnPage('main a').filter((_, link) => normalise(returnPage(link).text()) === 'Cancel')
    expect(cancel).toHaveLength(1)
    expect(cancel.attr('href')).toBe('/test-grant/confirm-land-and-actions')
  })

  describe('field-level error rendering', () => {
    it('renders without error classes, error message or aria-describedby when there are no errors', () => {
      const $ = renderPage()

      expect($('.govuk-error-summary:not(#map-no-parcels-error *)')).toHaveLength(0)
      expect($('.govuk-form-group--error')).toHaveLength(0)
      expect($('.govuk-error-message')).toHaveLength(0)
      expect($('#parcel-map').attr('aria-describedby')).toBeUndefined()
    })

    it('renders field-level error and associates with parcel-map when text error is provided', () => {
      const errorText = 'Select a land parcel on the map before you continue.'
      const $ = renderPage({
        errors: [{ text: errorText, href: '#parcel-map' }]
      })

      const summary = $('.govuk-error-summary:not(#map-no-parcels-error *)')
      expect(summary).toHaveLength(1)
      expect(normalise(summary.find('a').text())).toBe(errorText)
      expect(summary.find('a').attr('href')).toBe('#parcel-map')

      const formGroup = $('#parcel-map').closest('.govuk-form-group')
      expect(formGroup.hasClass('govuk-form-group--error')).toBe(true)

      const errorMessage = formGroup.find('.govuk-error-message')
      expect(errorMessage).toHaveLength(1)
      expect(errorMessage.attr('id')).toBe('parcel-map-error')
      expect(normalise(errorMessage.text())).toContain(errorText)

      expect($('#parcel-map').attr('aria-describedby')).toBe('parcel-map-error')
    })

    it('renders field-level errors and associates all error IDs with parcel-map when multiple HTML errors are provided', () => {
      const errorHtml1 = 'There are no eligible actions for parcel SD7148 9160.<br>Change the parcel land cover.'
      const errorHtml2 = 'There are no eligible actions for parcel SD7148 9161.<br>Change the parcel land cover.'
      const $ = renderPage({
        errors: [
          { html: errorHtml1, href: '#parcel-map' },
          { html: errorHtml2, href: '#parcel-map' }
        ]
      })

      const summary = $('.govuk-error-summary:not(#map-no-parcels-error *)')
      expect(summary).toHaveLength(1)
      expect(summary.find('a')).toHaveLength(2)

      const formGroup = $('#parcel-map').closest('.govuk-form-group')
      expect(formGroup.hasClass('govuk-form-group--error')).toBe(true)

      const errorMessages = formGroup.find('.govuk-error-message')
      expect(errorMessages).toHaveLength(2)
      expect(errorMessages.eq(0).attr('id')).toBe('parcel-map-error')
      expect(errorMessages.eq(0).html()).toContain(errorHtml1)
      expect(errorMessages.eq(1).attr('id')).toBe('parcel-map-error-2')
      expect(errorMessages.eq(1).html()).toContain(errorHtml2)

      expect($('#parcel-map').attr('aria-describedby')).toBe('parcel-map-error parcel-map-error-2')
    })
  })
})

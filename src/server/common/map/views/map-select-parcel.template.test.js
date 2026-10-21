// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { createPageRenderer } from '~/src/server/common/test-helpers/component-helpers.js'

const renderPage = createPageRenderer(import.meta.url, 'map-select-parcel.html', {
  pageTitle: 'Select a land parcel',
  formAction: '/select-land-parcel'
})

const normalise = (text) => text.replace(/\s+/g, ' ').trim()

describe('map-select-parcel.html', () => {
  it('shows a list-only hint without JavaScript, with map wording hidden until enhancement', () => {
    const $ = renderPage()
    const hint = $('#parcel-selection-hint').clone()
    expect(hint.find('#parcel-selection-map-hint').attr('hidden')).toBeDefined()
    hint.find('[hidden]').remove()
    expect(normalise(hint.text())).toBe('Select a parcel from the list of your parcels.')
  })

  it('exposes the map as a named group for assistive technology', () => {
    const map = renderPage()('#parcel-map')
    expect(map.attr('role')).toBe('group')
    expect(map.attr('aria-label')).toBe('Land parcel selection map')
  })

  it('renders a real parcel-page link for switching views without submitting the form', () => {
    const $ = renderPage({ formAction: '/test-grant/select-land-parcel?origin=confirm-land-and-actions' })
    expect($('#parcel-view-toggle').attr('href')).toBe('/test-grant/select-land-parcel?origin=confirm-land-and-actions')
    expect($('#parcel-view-toggle').is('a')).toBe(true)
  })

  it('constrains the parcel guidance inset to the same responsive grid column as the radio list', () => {
    const $ = renderPage()
    const inset = $('.parcel-selection-main > .govuk-inset-text')
    const listColumn = $('#land-parcels').closest('.parcel-selection-main')

    expect(inset).toHaveLength(1)
    expect(normalise(inset.text())).toBe(
      'You need to add each parcel individually. You can select actions and supplements for each parcel when you continue through the service.'
    )
    expect(inset.parent().attr('class')).toBe(listColumn.attr('class'))
    expect(inset.parent().parent().hasClass('govuk-grid-row')).toBe(true)
  })

  it('keeps the requirements notice hidden until requirements are available', () => {
    const $ = renderPage()
    const row = $('#selected-parcel-requirements-row')
    expect(row.attr('hidden')).toBeDefined()
    expect(row.find('dt').text()).toBe('Requirements')
    expect($('#selected-parcel-requirements-intro').text()).toBe('')
    expect($('#selected-parcel-requirements-list li')).toHaveLength(0)
  })

  it('keeps the live notice outside the hidden requirements row', () => {
    const $ = renderPage()
    const status = $('output#selected-parcel-requirements-status')
    expect(status).toHaveLength(1)
    expect(status.closest('#selected-parcel-details')).toHaveLength(1)
    expect(status.closest('#selected-parcel-requirements-row')).toHaveLength(0)
  })

  it('passes enabled action codes to the map without adding an action-code content block', () => {
    const $ = renderPage({ enabledLandActions: ['CLIG3', 'CSAM3'] })

    expect($('#parcel-map').attr('data-enabled-land-actions')).toBe('CLIG3,CSAM3')
    expect($('[data-enabled-land-actions]').not('#parcel-map')).toHaveLength(0)
  })

  it('renders the no-actions message hidden initially', () => {
    const $ = renderPage()
    const message = $('#summary-parcel-no-actions')

    expect(message.attr('hidden')).toBe('hidden')
    expect(normalise(message.text())).toBe(
      'There are no actions available for this land parcel. Select another land parcel to continue.'
    )
  })

  it('uses the available actions row layout for the list loading message', () => {
    const $ = renderPage({ parcels: [{ id: 'SO3757-3184', reference: 'SO3757 3184', area: '12.3456 ha' }] })
    const status = $('[data-parcel-details-status]')
    expect(status.hasClass('govuk-summary-list__row')).toBe(true)
    expect(status.closest('dl.govuk-summary-list').hasClass('govuk-!-font-size-16')).toBe(true)
    expect(status.children('dt').hasClass('govuk-summary-list__key')).toBe(true)
    expect(status.children('dd').hasClass('govuk-summary-list__value')).toBe(true)
    expect(status.attr('hidden')).toBeDefined()
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

  it('server-renders a usable text list and totals with extra details hidden without JavaScript', () => {
    const $ = renderPage({
      parcels: [
        {
          id: 'SO3757-3184',
          reference: 'SO3757 3184',
          area: '38.7654 ha',
          areaHa: 38.7654,
          added: true
        }
      ],
      selectedParcelIds: ['SO3757-3184'],
      totalArea: '38.7654'
    })
    const input = $('#land-parcels input')
    expect(input.attr('type')).toBe('radio')
    expect(input.attr('name')).toBe('landParcels')
    expect(input.attr('checked')).toBeDefined()
    expect(input.attr('disabled')).toBeUndefined()
    const label = $(`label[for="${input.attr('id')}"]`)
    expect(label.find(`#${input.attr('id')}-reference`).text()).toBe('SO3757 3184')
    expect(normalise(label.find(`#${input.attr('id')}-hint`).text())).toContain('Total area: 38.7654 ha')
    expect(input.attr('aria-labelledby')).toBe(`${input.attr('id')}-reference`)
    const firstDetailsRow = $('[data-parcel-details] .govuk-summary-list__row').first()
    expect(normalise(firstDetailsRow.find('dt').text())).toBe('Total area')
    expect(normalise(firstDetailsRow.find('dd').text())).toBe('38.7654 ha')
    expect(firstDetailsRow.attr('hidden')).toBeUndefined()
    expect($('#land-parcels').attr('hidden')).toBeUndefined()
    expect($('[data-parcel-details]').attr('hidden')).toBeDefined()
    expect($('[data-parcel-actions-row]').attr('hidden')).toBeDefined()
    expect($('[data-parcel-requirements-row]').attr('hidden')).toBeDefined()
    expect($('[data-parcel-action-count]').text()).toBe('')
    expect($('#land-parcels noscript')).toHaveLength(0)
    expect(normalise($('#land-parcels').text())).toContain('Added to application')
    expect($('#land-parcels').text()).not.toContain('Land covers')
    expect(normalise($('#parcel-map-total-count').text())).toBe('1')
    expect(normalise($('#parcel-map-total-area').text())).toBe('38.7654')
    expect($('#parcel-map-view').attr('hidden')).toBeDefined()
    expect($('#parcel-view-toggle-container').attr('hidden')).toBeDefined()
    expect($('#selected-parcels-inputs input').attr('disabled')).toBeDefined()
  })

  it('describes parcels only by their hints before JavaScript reveals their details', () => {
    const $ = renderPage({
      parcels: ['SO3757-3184', 'SO3757-3185'].map((id) => ({ id, reference: id.replace('-', ' '), area: '1.0000 ha' })),
      selectedParcelIds: ['SO3757-3185']
    })
    expect($('#land-parcel-1').attr('aria-describedby')).toBe('land-parcel-1-hint')
    expect($('#land-parcel-2').attr('aria-describedby')).toBe('land-parcel-2-hint')
    expect($('[data-parcel-details][hidden]')).toHaveLength(2)
  })

  it.each([
    [false, 'radio', 'govuk-radios', 'Select a parcel from the list of your parcels.', 1],
    [true, 'checkbox', 'govuk-checkboxes', 'Select one or more parcels from the list of your parcels.', 0]
  ])(
    'renders multiSelect=%s as %s controls with matching guidance',
    (multiSelect, type, controlClass, hint, insets) => {
      const $ = renderPage({
        multiSelect,
        parcels: [{ id: 'SO3757-3184', reference: 'SO3757 3184', area: '1.0000 ha' }]
      })
      const input = $('#land-parcels input')
      expect(input.attr('type')).toBe(type)
      expect(input.hasClass(`${controlClass}__input`)).toBe(true)
      expect(input.parent().hasClass(`${controlClass}__item`)).toBe(true)
      expect($(`label[for="${input.attr('id')}"]`).hasClass(`${controlClass}__label`)).toBe(true)
      expect($(`#land-parcels > .${controlClass}`)).toHaveLength(1)
      const hintEl = $('#parcel-selection-hint').clone()
      hintEl.find('[hidden]').remove()
      expect(normalise(hintEl.text())).toBe(hint)
      expect($('.parcel-selection-main > .govuk-inset-text')).toHaveLength(insets)
    }
  )

  describe('field-level error rendering', () => {
    it('renders without error classes, error message or aria-describedby when there are no errors', () => {
      const $ = renderPage()

      expect($('.govuk-error-summary')).toHaveLength(0)
      expect($('.govuk-form-group--error')).toHaveLength(0)
      expect($('.govuk-error-message')).toHaveLength(0)
      expect($('#parcel-map').attr('aria-describedby')).toBeUndefined()
    })

    it('renders field-level error and associates with parcel-map when text error is provided', () => {
      const errorText = 'Select a land parcel before you continue.'
      const $ = renderPage({
        errors: [{ text: errorText, href: '#land-parcels' }]
      })

      const summary = $('.govuk-error-summary')
      expect(summary).toHaveLength(1)
      expect(normalise(summary.find('a').text())).toBe(errorText)
      expect(summary.find('a').attr('href')).toBe('#land-parcels')

      const formGroup = $('#parcel-map').closest('.govuk-form-group')
      expect(formGroup.hasClass('govuk-form-group--error')).toBe(true)

      const errorMessage = formGroup.find('.govuk-error-message')
      expect(errorMessage).toHaveLength(1)
      expect(errorMessage.attr('id')).toBe('parcel-map-error')
      expect(normalise(errorMessage.text())).toContain(errorText)

      expect($('#parcel-map').attr('aria-describedby')).toBe('parcel-map-error')
      expect($('#land-parcels').attr('aria-describedby')).toBe('parcel-selection-hint parcel-map-error')
    })

    it('renders field-level errors and associates all error IDs with parcel-map when multiple HTML errors are provided', () => {
      const errorHtml1 =
        'There are no actions available for parcel SD7148 9160. Select another land parcel to continue.'
      const errorHtml2 =
        'There are no actions available for parcel SD7148 9161. Select another land parcel to continue.'
      const $ = renderPage({
        errors: [
          { html: errorHtml1, href: '#land-parcels' },
          { html: errorHtml2, href: '#land-parcels' }
        ]
      })

      const summary = $('.govuk-error-summary')
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

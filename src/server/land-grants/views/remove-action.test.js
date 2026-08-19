import { describe, it, expect } from 'vitest'
import { createPageRenderer } from '~/src/server/common/test-helpers/component-helpers.js'

const renderPage = createPageRenderer(import.meta.url, 'remove-action.html', {
  backLink: { text: 'Back', href: '/test-grant/confirm-land-and-actions' }
})

const parcelModel = {
  parcelId: 'SK0971-4776',
  pageHeading: 'Remove all actions from SK0971 4776?',
  hint: 'This will remove SK0971 4776 and all actions added to it from your application.',
  isParcelRemoval: true
}

const actionModel = {
  parcelId: 'SD6743-8083',
  pageHeading:
    'Do you want to remove Assess moorland and produce a written record: CMOR1 from land parcel SD6743 8083?',
  hint: 'Select yes to remove this action from this land parcel. You can add a different action to the same parcel.',
  isParcelRemoval: false
}

const normalise = (text) => text.replace(/\s+/g, ' ').trim()

describe('remove-action.html view', () => {
  describe('whole-parcel removal', () => {
    it('should announce the parcel and its actions with a single page heading', () => {
      const $ = renderPage(parcelModel)

      const headings = $('main h1')
      expect(headings).toHaveLength(1)
      expect(normalise(headings.text())).toBe('Remove all actions from SK0971 4776?')
      expect(headings.hasClass('govuk-heading-l')).toBe(true)
      expect($('title').text()).toContain('Remove all actions from SK0971 4776?')
    })

    it('should explain the consequence of removing the parcel', () => {
      const $ = renderPage(parcelModel)

      expect(normalise($('main p.govuk-body').first().text())).toBe(
        'This will remove SK0971 4776 and all actions added to it from your application.'
      )
    })

    it('should confirm removal through a single hidden field alongside the crumb', () => {
      const $ = renderPage(parcelModel)

      const form = $('main form')
      expect(form.attr('method')).toBe('post')
      expect(form.find('input[name="crumb"]').attr('value')).toBe('test-crumb')

      const remove = form.find('input[name="remove"]')
      expect(remove).toHaveLength(1)
      expect(remove.attr('type')).toBe('hidden')
      expect(remove.attr('value')).toBe('true')
    })

    it('should offer a destructive button and an inline cancel link back to the return path', () => {
      const $ = renderPage(parcelModel)

      const group = $('main .govuk-button-group')
      const button = group.find('button')
      expect(normalise(button.text())).toBe('Remove all actions')
      expect(button.hasClass('govuk-button--warning')).toBe(true)
      expect(button.attr('data-prevent-double-click')).toBe('true')

      const cancel = group.find('a')
      expect(normalise(cancel.text())).toBe('Cancel')
      expect(cancel.attr('href')).toBe('/test-grant/confirm-land-and-actions')
      expect(cancel.hasClass('govuk-link')).toBe(true)
    })

    it('should not render radios, an error summary or support details', () => {
      const $ = renderPage({ ...parcelModel, errors: 'Select yes to remove this land parcel' })

      expect($('main .govuk-radios')).toHaveLength(0)
      expect($('main .govuk-error-summary')).toHaveLength(0)
      expect($('main .govuk-details')).toHaveLength(0)
      expect(normalise($('main').text())).not.toContain('Select yes to remove this land parcel')
    })
  })

  describe('action removal', () => {
    it('should keep the inline yes/no radios and Continue button', () => {
      const $ = renderPage(actionModel)

      const radios = $('main .govuk-radios')
      expect(radios).toHaveLength(1)
      expect(radios.hasClass('govuk-radios--inline')).toBe(true)
      expect(
        radios
          .find('input[name="remove"]')
          .map((_, input) => $(input).attr('value'))
          .get()
      ).toEqual(['true', 'false'])
      expect(normalise($('main legend').text())).toBe(actionModel.pageHeading)
      expect(normalise($('main .govuk-hint').first().text())).toBe(actionModel.hint)
      expect(normalise($('main button').text())).toBe('Continue')
      expect($('main button').hasClass('govuk-button--warning')).toBe(false)
    })

    it('should render the validation summary and field error when the choice is missing', () => {
      const $ = renderPage({ ...actionModel, errors: 'Select yes to remove this action from this land parcel' })

      expect(normalise($('main .govuk-error-summary__title').text())).toBe('There is a problem')
      expect(normalise($('main .govuk-error-summary a').text())).toBe(
        'Select yes to remove this action from this land parcel'
      )
      expect($('main .govuk-error-summary a').attr('href')).toBe('#remove')
      expect(normalise($('main .govuk-error-message').text())).toContain(
        'Select yes to remove this action from this land parcel'
      )
    })
  })
})

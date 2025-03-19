import { renderComponent } from '~/src/server/common/test-helpers/component-helpers.js'

describe('Heading Component', () => {
  /** @type {CheerioAPI} */
  let $heading

  describe('With caption', () => {
    beforeEach(() => {
      $heading = renderComponent('heading', {
        text: 'Services',
        caption: 'A page showing available services'
      })
    })

    test('Should render app heading component', () => {
      expect($heading('[data-testid="app-heading"]')).toHaveLength(1)
    })

    test('Should contain expected heading', () => {
      expect($heading('[data-testid="app-heading-title"]').text().trim()).toBe(
        'Services'
      )
    })

    test('Should have expected heading caption', () => {
      expect(
        $heading('[data-testid="app-heading-caption"]').text().trim()
      ).toBe('A page showing available services')
    })
  })
})

/**
 * @import { CheerioAPI } from 'cheerio'
 */

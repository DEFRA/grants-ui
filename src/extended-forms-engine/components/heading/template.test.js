import { createComponentRenderer } from '../../test-helpers/component-helpers.js'

const renderHeading = createComponentRenderer(import.meta.url, 'appHeading')

describe('Heading Component', () => {
  /** @type {CheerioAPI} */
  let $heading

  describe('With caption', () => {
    beforeEach(() => {
      $heading = renderHeading({
        text: 'Services',
        caption: 'A page showing available services'
      })
    })

    test('Should render app heading component', () => {
      expect($heading('[data-testid="app-heading"]')).toHaveLength(1)
    })

    test('Should contain expected heading', () => {
      expect($heading('[data-testid="app-heading-title"]').text().trim()).toBe('Services')
    })

    test('Should have expected heading caption', () => {
      expect($heading('[data-testid="app-heading-caption"]').text().trim()).toBe('A page showing available services')
    })
  })
})

/**
 * @import { CheerioAPI } from 'cheerio'
 */

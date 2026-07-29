import { createComponentRenderer } from '~/src/server/common/test-helpers/component-helpers.js'

const renderBrandBar = createComponentRenderer(import.meta.url, 'defraBrandBar')

describe('Brand Bar Component', () => {
  test('renders a plain-text department banner without the GOV.UK crown header', () => {
    const $brandBar = renderBrandBar({})

    expect($brandBar('.defra-brand-bar').text()).toContain('Department for Environment, Food & Rural Affairs')
    expect($brandBar('.defra-brand-bar').attr('role')).toBe('banner')
    expect($brandBar('.govuk-header').length).toBe(0)
  })
})

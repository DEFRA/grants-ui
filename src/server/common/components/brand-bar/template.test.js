import { createComponentRenderer } from '~/src/server/common/test-helpers/component-helpers.js'

const renderBrandBar = createComponentRenderer(import.meta.url, 'defraBrandBar')

describe('Brand Bar Component', () => {
  test('renders a blue clickable DEFRA crest banner without the GOV.UK crown header', () => {
    const $brandBar = renderBrandBar({ defraAssetPath: '/public/assets/defra' })

    const $link = $brandBar('.defra-brand-bar a.defra-brand-bar__link')
    const $logo = $link.find('img.defra-brand-bar__logotype')

    expect($brandBar('.defra-brand-bar').attr('role')).toBe('banner')
    expect($link.attr('href')).toBe(
      'https://www.gov.uk/government/organisations/department-for-environment-food-rural-affairs'
    )
    expect($logo.attr('src')).toBe('/public/assets/defra/images/defra-crest.png')
    expect($logo.attr('alt')).toBe('Department for Environment, Food & Rural Affairs')
    expect($brandBar('.govuk-header').length).toBe(0)
  })
})

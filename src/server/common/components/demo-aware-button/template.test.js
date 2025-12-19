import { createComponentRenderer } from '~/src/server/common/test-helpers/component-helpers.js'

const renderDemoAwareButton = createComponentRenderer(import.meta.url, 'appDemoAwareButton')

describe('Demo Aware Button Component', () => {
  const buttonStateTests = [
    {
      name: 'dev mode with allowSubmit false',
      params: { isDevelopmentMode: true, allowSubmit: false, text: 'Continue' },
      expectDisabled: true,
      expectMessage: 'Button disabled in demo mode'
    },
    {
      name: 'dev mode without allowSubmit specified',
      params: { isDevelopmentMode: true, text: 'Submit' },
      expectDisabled: true,
      expectMessage: 'Button disabled in demo mode'
    },
    {
      name: 'dev mode with allowSubmit true',
      params: { isDevelopmentMode: true, allowSubmit: true, text: 'Continue' },
      expectDisabled: false,
      expectMessage: null
    },
    {
      name: 'non-dev mode',
      params: { isDevelopmentMode: false, text: 'Continue' },
      expectDisabled: false,
      expectMessage: null
    }
  ]

  test.each(buttonStateTests)(
    'should render correct button state for $name',
    ({ params, expectDisabled, expectMessage }) => {
      const $button = renderDemoAwareButton(params)

      if (expectDisabled) {
        expect($button('button').attr('disabled')).toBeDefined()
      } else {
        expect($button('button').attr('disabled')).toBeUndefined()
      }

      if (expectMessage) {
        expect($button('p.govuk-body-s').text().trim()).toBe(expectMessage)
      } else {
        expect($button('p.govuk-body-s')).toHaveLength(0)
      }
    }
  )

  test('should include hidden crumb input when not in dev mode', () => {
    const $button = renderDemoAwareButton({
      isDevelopmentMode: false,
      crumb: 'test-crumb-value'
    })

    expect($button('input[name="crumb"]').attr('value')).toBe('test-crumb-value')
  })

  test('should show custom disabled message when provided', () => {
    const $button = renderDemoAwareButton({
      isDevelopmentMode: true,
      allowSubmit: false,
      disabledMessage: 'Custom disabled text'
    })

    expect($button('p.govuk-body-s').text().trim()).toBe('Custom disabled text')
  })

  test('should use default button text when none provided', () => {
    const $button = renderDemoAwareButton({ isDevelopmentMode: false })

    expect($button('button').text().trim()).toBe('Continue')
  })
})

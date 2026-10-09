// @vitest-environment jsdom
import { runInNewContext } from 'node:vm'
import { afterEach, describe, expect, it } from 'vitest'
import { initSelectActionsPage } from './select-actions-events.js'
import { createPageRenderer } from '~/src/server/common/test-helpers/component-helpers.js'

const renderPage = createPageRenderer(
  import.meta.url,
  'select-actions.html',
  {
    pageTitle: 'Select actions for this land parcel',
    errors: [],
    actionItems: [{ text: 'Action one', value: 'ACTION1' }],
    actionFieldName: 'landAction',
    chosenAreaFieldsHtml: '',
    pageConsents: []
  },
  ['src/server/land-grants/views']
)

afterEach(() => {
  document.body.innerHTML = ''
  window.history.replaceState(null, '', '/')
})

describe('select-actions template browser behaviour', () => {
  it('blocks selection before the page module loads and releases controls after initialization', () => {
    const $ = renderPage({ cspNonce: 'test-nonce' })
    document.body.innerHTML = $('#select-actions-form').prop('outerHTML')
    window.history.replaceState(null, '', '/test-grant/select-actions-for-land-parcel?parcelId=SD1234-5678')
    const form = document.getElementById('select-actions-form')
    const checkbox = form.querySelector('input[type="checkbox"]')
    const button = form.querySelector('button')
    const script = form.querySelector('script')
    expect(script.nonce).toBe('test-nonce')

    // The parser executes this inline script before rendering the action controls.
    runInNewContext(script.textContent, { document })
    expect(checkbox.matches(':disabled')).toBe(true)
    expect(button.matches(':disabled')).toBe(true)
    checkbox.click()
    expect(checkbox.checked).toBe(false)

    initSelectActionsPage(form)
    expect(checkbox.matches(':disabled')).toBe(false)
    expect(button.matches(':disabled')).toBe(false)
  })
})

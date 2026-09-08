import { describe, expect, it } from 'vitest'
import { createPageRenderer } from '~/src/server/common/test-helpers/component-helpers.js'

const renderPage = createPageRenderer(import.meta.url, 'select-actions.html', {
  pageTitle: 'Select actions for this land parcel',
  errors: [],
  actionItems: [{ text: 'Action one', value: 'ACTION1' }],
  actionFieldName: 'landAction',
  chosenAreaFieldsHtml: '',
  pageConsents: [],
  parcelSummaryList: {
    rows: [{ key: { text: 'Parcel reference' }, value: { text: 'SD1234 5678' } }]
  },
  selectLandParcelPath: '/test-grant/select-land-parcel'
})

const normalise = (text) => text.replace(/\s+/g, ' ').trim()
const linksNamed = ($, name) => $('main a').filter((_, link) => normalise($(link).text()) === name)

describe('select-actions.html', () => {
  it('shows the parcel Change link without Cancel in the normal journey', () => {
    const $ = renderPage()

    expect(linksNamed($, 'Change selected land parcel')).toHaveLength(1)
    expect(linksNamed($, 'Cancel')).toHaveLength(0)
  })

  it('shows Cancel and hides the parcel Change link for a direct change from confirmation', () => {
    const $ = renderPage({
      cancelHref: '/test-grant/confirm-land-and-actions',
      hideParcelChange: true
    })

    expect(linksNamed($, 'Change selected land parcel')).toHaveLength(0)
    const cancel = linksNamed($, 'Cancel')
    expect(cancel).toHaveLength(1)
    expect(cancel.attr('href')).toBe('/test-grant/confirm-land-and-actions')
  })

  it('keeps the parcel Change link when confirmation sent the user through the parcel picker', () => {
    const $ = renderPage({
      cancelHref: '/test-grant/confirm-land-and-actions',
      hideParcelChange: false
    })

    expect(linksNamed($, 'Change selected land parcel')).toHaveLength(1)
    expect(linksNamed($, 'Cancel')).toHaveLength(1)
  })

  it('shows Cancel when no eligible actions are available', () => {
    const $ = renderPage({
      actionItems: [],
      cancelHref: '/test-grant/confirm-land-and-actions'
    })

    expect(linksNamed($, 'Cancel')).toHaveLength(1)
  })
})

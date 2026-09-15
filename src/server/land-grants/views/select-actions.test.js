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

  it('uses the current scheme page configuration for both consent links and escapes URL attributes', () => {
    const path = '/select-actions-for-land-parcel'
    const configuredLinks = {
      sssi_consent: { href: 'https://example.test/sssi?scheme=grasslands&section=consent' },
      sfi_hefer: { href: 'https://example.test/hefer?note=" onmouseover="alert(1)&section=request' }
    }
    const $ = renderPage({
      pageConsents: ['sssi', 'hefer'],
      page: { path, def: { metadata: { pageConfig: { [path]: { links: configuredLinks } } } } }
    })
    const links = $('#parcel-consent-intro a')

    expect(links.map((_, link) => $(link).attr('href')).get()).toEqual([
      configuredLinks.sssi_consent.href,
      configuredLinks.sfi_hefer.href
    ])
    expect(links.map((_, link) => $(link).attr('target')).get()).toEqual(['_blank', '_blank'])
    expect(links.eq(1).attr('onmouseover')).toBeUndefined()
  })

  it('retains the consent warning without empty or hardcoded links when guidance is not configured', () => {
    const $ = renderPage({ pageConsents: ['sssi', 'hefer'] })
    const warning = $('#parcel-consent-intro')

    expect(warning.find('a')).toHaveLength(0)
    expect(normalise(warning.text())).toContain('Some actions on this parcel need SSSI consent and an SFI HEFER.')
    expect(warning.text()).not.toContain('opens in new tab')
  })
})

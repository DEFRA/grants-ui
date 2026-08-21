// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'

const template = readFileSync(fileURLToPath(new URL('./map-select-parcel.html', import.meta.url)), 'utf8')

describe('map-select-parcel.html', () => {
  it('contains no inline <script> bodies (all JS lives in webpack entries)', () => {
    const bodies = [...template.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1].trim())
    expect(bodies).toEqual(bodies.map(() => ''))
  })

  it('loads the component and page-wiring bundles via getAssetPath', () => {
    expect(template).toContain("getAssetPath('parcel-map.js')")
    expect(template).toContain("getAssetPath('parcel-select-page.js')")
  })

  it('renders no action-code block: the consent lookup is keyed on the parcel alone', () => {
    expect(template).not.toContain('enabled-land-actions')
    expect(template).not.toContain('data-enabled-land-action')
  })

  it('renders the Additional details row hidden, with an empty value cell', () => {
    const row = /<div class="[^"]*" id="selected-parcel-additional-details-row"[^>]*>([\s\S]*?)<\/div>/.exec(template)

    expect(row?.[0]).toContain('hidden')
    expect(row?.[0]).toContain('govuk-summary-list__row--no-actions')
    expect(row?.[1]).toContain('<dt class="govuk-summary-list__key">Additional details</dt>')
    expect(row?.[1]).toContain('<dd class="govuk-summary-list__value" id="selected-parcel-additional-details"></dd>')
  })

  it('places the live status region inside the summary block but outside the hidden row', () => {
    const details = /<div id="selected-parcel-details"[\s\S]*?<\/dl>([\s\S]*?)<\/div>/.exec(template)

    expect(details?.[1]).toContain(
      '<span id="selected-parcel-additional-details-status" class="govuk-visually-hidden" role="status"></span>'
    )
  })
})

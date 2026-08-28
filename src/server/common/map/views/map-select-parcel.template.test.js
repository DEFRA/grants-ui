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

  it('gives <parcel-map> a role so its aria-label is valid for assistive tech', () => {
    const openingTag = template.match(/<parcel-map\b[\s\S]*?>/)?.[0] ?? ''
    expect(openingTag).toContain('role="group"')
    expect(openingTag).toContain('aria-label="Land parcel selection map"')
  })

  it('renders no action-code block: the consent lookup is keyed on the parcel alone', () => {
    expect(template).not.toContain('enabled-land-actions')
    expect(template).not.toContain('data-enabled-land-action')
  })

  it('renders the Requirements row hidden, with an empty intro and bullet list', () => {
    const row = /<div class="[^"]*" id="selected-parcel-requirements-row"[^>]*>([\s\S]*?)<\/dd>/.exec(template)

    expect(row?.[0]).toContain('hidden')
    expect(row?.[0]).toContain('govuk-summary-list__row--no-actions')
    expect(row?.[1]).toContain('<dt class="govuk-summary-list__key">Requirements</dt>')
    expect(row?.[1]).toContain('id="selected-parcel-requirements-intro"></p>')
    expect(row?.[1]).toContain('govuk-list govuk-list--bullet')
    expect(row?.[1]).toContain('id="selected-parcel-requirements-list"></ul>')
  })

  it('places the live status region inside the summary block but outside the hidden row', () => {
    const details = /<div id="selected-parcel-details"[\s\S]*?<\/dl>([\s\S]*?)<\/div>/.exec(template)

    expect(details?.[1]).toContain(
      '<output id="selected-parcel-requirements-status" class="govuk-visually-hidden"></output>'
    )
  })
})

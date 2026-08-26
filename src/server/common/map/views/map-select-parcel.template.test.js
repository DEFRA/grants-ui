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

  it('keeps the Additional requirements row inside an inert <template>, so no stylesheet can reveal it empty', () => {
    const tpl = /<template id="selected-parcel-additional-requirements-template">([\s\S]*?)<\/template>/.exec(template)

    expect(tpl?.[1]).toContain('id="selected-parcel-additional-requirements-row"')
    expect(tpl?.[1]).toContain('govuk-summary-list__row--no-actions')
    expect(tpl?.[1]).toContain('<dt class="govuk-summary-list__key">Additional requirements</dt>')
    expect(tpl?.[1]).toContain(
      '<dd class="govuk-summary-list__value" id="selected-parcel-additional-requirements"></dd>'
    )
  })

  it('renders no Additional requirements row outside that template', () => {
    const withoutTemplate = template.replace(
      /<template id="selected-parcel-additional-requirements-template">[\s\S]*?<\/template>/,
      ''
    )

    expect(withoutTemplate).not.toContain('selected-parcel-additional-requirements-row')
  })

  it('places the live status region inside the summary block but outside the summary list', () => {
    const details = /<div id="selected-parcel-details"[\s\S]*?<\/dl>([\s\S]*?)<\/div>/.exec(template)

    expect(details?.[1]).toContain(
      '<output id="selected-parcel-additional-requirements-status" class="govuk-visually-hidden"></output>'
    )
  })
})

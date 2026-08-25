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
})

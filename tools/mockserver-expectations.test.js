// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Guards the MockServer stub that backs the default local stack, where
 * LAND_GRANTS_API_URL and GAS_API_URL both point at http://mockserver:1080.
 * These are the failure modes this file exists to catch:
 *   - a stub drifting off the path its client actually calls, which turns into
 *     a silent 404 that nothing else in the repo notices
 *   - two expectations that match the same request but answer differently, so
 *     which one wins depends on array order rather than intent
 *   - a parcels body a consumer cannot read
 */
const expectationsPath = fileURLToPath(new URL('../mockserver/expectations.json', import.meta.url))
const expectations = JSON.parse(readFileSync(expectationsPath, 'utf8'))

const landGrants = expectations.filter((e) => e.id.startsWith('land-grants-api-'))
const forPath = (path) => landGrants.filter((e) => e.httpRequest.path === path)
const matcherOf = (e) => e.httpRequest.body?.jsonPath ?? null
const parcelsOf = (e) => e.httpResponse.body?.parcels ?? []

/**
 * Every land-grants endpoint `src/server/land-grants/services/land-grants.client.js`
 * and `src/server/woodland/woodland.client.js` post to, except the binary
 * vector-tile route: that serves protobuf and the default stack sets
 * MAP_MOCK_DATA_ENABLED=true, so the map never calls it. See docs/DOCKER.md.
 */
const CLIENT_PATHS = [
  '/api/v2/parcels',
  '/api/v2/payments/calculate',
  '/api/v2/application/validate',
  '/api/v1/parcel-tiles/locate',
  '/api/v1/wmp/validate',
  '/api/v1/wmp/payments/calculate',
  '/api/v1/wmp/payments/calculate-by-total-area'
]

describe('mockserver/expectations.json', () => {
  it('is a non-empty array of expectations with unique ids', () => {
    expect(Array.isArray(expectations)).toBe(true)
    expect(expectations.length).toBeGreaterThan(0)

    const ids = expectations.map((e) => e.id)
    expect(ids).toHaveLength(new Set(ids).size)
  })

  it.each(CLIENT_PATHS)('stubs %s, so the default local stack never 404s on it', (path) => {
    expect(forPath(path).length).toBeGreaterThan(0)
  })

  it('does not stub a payments path no client calls', () => {
    // The client moved to /api/v2/payments/calculate; a stub left on the old
    // path answers nothing and hides the fact that payments are unmocked.
    expect(landGrants.map((e) => e.httpRequest.path)).not.toContain('/payments/calculate')
  })

  it('never has two expectations that match the same request differently', () => {
    const seen = new Map()

    for (const expectation of landGrants) {
      const key = [
        expectation.httpRequest.method,
        expectation.httpRequest.path,
        expectation.priority ?? 0,
        matcherOf(expectation) ?? 'NO_MATCHER'
      ].join(' ')
      const clash = seen.get(key)

      expect(clash, `${expectation.id} matches the same requests as ${clash} at the same priority`).toBeUndefined()
      seen.set(key, expectation.id)
    }
  })

  it('answers a grouped parcels request with group definitions and actions to group', () => {
    // parcelsGroups sends fields: ['groups'] and parcelsWithGroups sends
    // ['actions', 'size', 'groups', ...]; both must land on a stub that carries
    // groups, or the grouped page renders no groups at all.
    const grouped = forPath('/api/v2/parcels').filter((e) => matcherOf(e)?.includes("'groups'"))
    expect(grouped).toHaveLength(1)

    const [expectation] = grouped
    const groups = expectation.httpResponse.body.groups
    expect(groups.length).toBeGreaterThan(0)

    const actionCodes = parcelsOf(expectation).flatMap((p) => (p.actions ?? []).map((a) => a.code))
    for (const group of groups) {
      expect(group.name).toBeTruthy()
      expect(group.actions.length).toBeGreaterThan(0)
      // A group naming an action the parcel does not offer groups to nothing.
      expect(actionCodes).toEqual(expect.arrayContaining(group.actions))
    }
  })

  it('outranks the actions stub for grouped requests, which carry both fields', () => {
    const priorityFor = (field) => {
      const match = forPath('/api/v2/parcels').find((e) => matcherOf(e)?.includes(`'${field}'`))
      return match?.priority ?? 0
    }

    expect(priorityFor('groups')).toBeGreaterThan(priorityFor('actions'))
  })

  it('gives every stubbed parcel a readable size, since consumers read size.value', () => {
    for (const expectation of forPath('/api/v2/parcels')) {
      for (const parcel of parcelsOf(expectation)) {
        if (parcel.size) {
          expect(typeof parcel.size.value, `${expectation.id} parcel ${parcel.sheetId}-${parcel.parcelId}`).toBe(
            'number'
          )
          expect(parcel.size.unit).toBeTruthy()
        }
      }
    }
  })

  it('exercises each consent branch, so the additional requirements row is reachable locally', () => {
    const actions = forPath('/api/v2/parcels').flatMap((e) => parcelsOf(e).flatMap((p) => p.actions ?? []))

    expect(actions.some((a) => a.sssiConsentRequired && !a.heferRequired)).toBe(true)
    expect(actions.some((a) => a.heferRequired && !a.sssiConsentRequired)).toBe(true)
    expect(actions.some((a) => a.sssiConsentRequired && a.heferRequired)).toBe(true)
  })

  it('returns the woodland payment fields the GAS answers mapper reads', () => {
    // woodland/mappers/state-to-gas-answers-mapper.js maps
    // payment.agreementLevelItems, and woodland.service.js reads
    // payment.agreementTotalPence — a totals-only stub submits an empty agreement.
    for (const path of ['/api/v1/wmp/payments/calculate', '/api/v1/wmp/payments/calculate-by-total-area']) {
      for (const expectation of forPath(path)) {
        const payment = expectation.httpResponse.body.payment
        expect(typeof payment.agreementTotalPence).toBe('number')

        const items = Object.values(payment.agreementLevelItems ?? {})
        expect(items.length).toBeGreaterThan(0)
        for (const item of items) {
          expect(item.code).toBeTruthy()
          expect(typeof item.agreementTotalPence).toBe('number')
          expect(item.unit).toBeTruthy()
        }
      }
    }
  })

  it('returns a bbox the map viewport helper can read', () => {
    for (const expectation of forPath('/api/v1/parcel-tiles/locate')) {
      const bbox = expectation.httpResponse.body.bbox
      for (const key of ['minLng', 'minLat', 'maxLng', 'maxLat']) {
        expect(typeof bbox[key]).toBe('number')
      }
      expect(bbox.minLng).toBeLessThan(bbox.maxLng)
      expect(bbox.minLat).toBeLessThan(bbox.maxLat)
    }
  })

  describe('resolving the bodies the clients actually send', () => {
    /**
     * Evaluates the JSON_PATH predicate forms this file uses against a request
     * body. Throws on an unrecognised form so a new matcher style cannot slip
     * past this guard by silently evaluating to "no match".
     * @param {string} jsonPath
     * @param {Record<string, any>} body
     * @returns {boolean}
     */
    const matches = (jsonPath, body) => {
      const field = /^\$\.(fields|parcelIds)\[\?\(@ == '(.+)'\)\]$/.exec(jsonPath)
      if (field) {
        return (body[field[1]] ?? []).includes(field[2])
      }

      const nthAction = /^\$\.parcel\[\*\]\.actions\[(\d+)\]$/.exec(jsonPath)
      if (nthAction) {
        return (body.parcel ?? []).some((p) => (p.actions ?? []).length > Number(nthAction[1]))
      }

      const actionCode = /^\$\.parcel\[\*\]\.actions\[\?\(@\.code == '(.+)'\)\]$/.exec(jsonPath)
      if (actionCode) {
        return (body.parcel ?? []).some((p) => (p.actions ?? []).some((a) => a.code === actionCode[1]))
      }

      throw new Error(`unrecognised matcher form, extend this guard: ${jsonPath}`)
    }

    const CONSENT_FIELDS = ['actions.sssiConsentRequired', 'actions.heferRequired']

    // Exactly what land-grants.client.js / woodland.client.js POST, including
    // the sibling keys a real body always carries. Matching one predicate in
    // isolation proves nothing: a real parcels body names a parcel AND fields,
    // so a parcel-specific matcher and a fields matcher can both match it.
    const parcelsBody = (parcelIds, fields) => ({ parcelIds, fields, sbi: '106238911', plannedActions: [] })

    const REAL_BODIES = [
      { label: 'parcelsWithSize', path: '/api/v2/parcels', body: parcelsBody(['SD6843-7039'], ['size']) },
      {
        label: 'parcelsWithSize for SD5649-9215',
        path: '/api/v2/parcels',
        body: parcelsBody(['SD5649-9215'], ['size'])
      },
      { label: 'parcelsGroups', path: '/api/v2/parcels', body: parcelsBody(['SD6843-7039'], ['groups']) },
      {
        label: 'parcelsWithGroups',
        path: '/api/v2/parcels',
        body: parcelsBody(['SD6843-7039'], ['actions', 'size', 'groups', ...CONSENT_FIELDS])
      },
      {
        label: 'parcelsWithActions',
        path: '/api/v2/parcels',
        body: parcelsBody(['SD6843-7039'], ['actions', 'size', ...CONSENT_FIELDS])
      },
      {
        label: 'parcelsWithActions for SD5649-9215',
        path: '/api/v2/parcels',
        body: parcelsBody(['SD5649-9215'], ['actions', 'size', ...CONSENT_FIELDS])
      },
      {
        label: 'parcelsWithGroups for SD5649-9215',
        path: '/api/v2/parcels',
        body: parcelsBody(['SD5649-9215'], ['actions', 'size', 'groups', ...CONSENT_FIELDS])
      },
      {
        label: 'calculate for one action',
        path: '/api/v2/payments/calculate',
        body: { parcel: [{ sheetId: 'SD6843', parcelId: '7039', actions: [{ code: 'CMOR1', quantity: 1 }] }] }
      },
      {
        label: 'calculate for TEST1 alone',
        path: '/api/v2/payments/calculate',
        body: { parcel: [{ actions: [{ code: 'TEST1', quantity: 1 }] }] }
      },
      {
        label: 'calculate for TEST1 and TEST2',
        path: '/api/v2/payments/calculate',
        body: {
          parcel: [
            {
              actions: [
                { code: 'TEST1', quantity: 1 },
                { code: 'TEST2', quantity: 2 }
              ]
            }
          ]
        }
      }
    ]

    const winnersFor = (path, body) => {
      const candidates = forPath(path).filter((e) => {
        const jsonPath = matcherOf(e)
        return jsonPath === null || matches(jsonPath, body)
      })
      const topPriority = Math.max(...candidates.map((e) => e.priority ?? 0))
      return { candidates, winners: candidates.filter((e) => (e.priority ?? 0) === topPriority) }
    }

    it.each(REAL_BODIES)('resolves $label to exactly one winning expectation', ({ path, body }) => {
      const { candidates, winners } = winnersFor(path, body)

      expect(candidates.length).toBeGreaterThan(0)
      // MockServer serves the highest priority; ties fall back to array order,
      // which is luck rather than intent. Exactly one must hold the top slot.
      expect(winners.map((e) => e.id).join(' vs ')).toBe(winners[0].id)
    })

    it('serves the parcel-specific stub, not the generic size stub, for its own parcel', () => {
      const { winners } = winnersFor('/api/v2/parcels', parcelsBody(['SD5649-9215'], ['size']))
      const parcel = winners[0].httpResponse.body.parcels[0]

      expect(`${parcel.sheetId}-${parcel.parcelId}`).toBe('SD5649-9215')
    })

    it('still serves actions for the parcel-specific stub, which has none of its own', () => {
      // The parcel matcher must sit below the actions matcher: a size-only body
      // winning an actions request would empty the select-actions page.
      const { winners } = winnersFor(
        '/api/v2/parcels',
        parcelsBody(['SD5649-9215'], ['actions', 'size', ...CONSENT_FIELDS])
      )

      expect(winners[0].id).toBe('land-grants-api-parcels-actions-200')
      expect(winners[0].httpResponse.body.parcels[0].actions.length).toBeGreaterThan(0)
    })

    it('still serves groups for the parcel-specific stub', () => {
      const { winners } = winnersFor(
        '/api/v2/parcels',
        parcelsBody(['SD5649-9215'], ['actions', 'size', 'groups', ...CONSENT_FIELDS])
      )

      expect(winners[0].id).toBe('land-grants-api-parcels-groups-200')
      expect(winners[0].httpResponse.body.groups.length).toBeGreaterThan(0)
    })
  })
})

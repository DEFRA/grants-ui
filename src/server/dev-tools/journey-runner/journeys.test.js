import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { parse } from 'yaml'

/**
 * Drift guard: journey definitions are hand-written against a grant's form
 * definition, but nothing links the two - so a page added to (or removed from)
 * the YAML silently strands or skips journey steps. Worse, the runner reports an
 * unmatched page as `journey complete`, which the `gt journey` CLI counts as a
 * SUCCESS marker, so a journey that stops halfway still exits zero.
 *
 * Example form definitions are checked in, so their drift checks also run in
 * CI and fresh clones. Real grant checks additionally use the gitignored
 * config-broker-local tree when it has been populated by local setup.
 */

const journeysDir = resolve(import.meta.dirname, './journeys')
const configBrokerDir = resolve(import.meta.dirname, '../../../../compose/config-broker-local')
const exampleGrantsDir = resolve(import.meta.dirname, '../../../../compose/config-broker/example-grants')
const exampleGrants = readdirSync(exampleGrantsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)

/**
 * Pages that sit outside the forward page walk: terminal/exit pages, post-submit
 * pages, and the land-grants remove pages that are only reached from a link on
 * the confirm/check page. A journey is not expected to cover these.
 */
const OFF_JOURNEY_CONTROLLERS = new Set([
  'ConfirmationPageController',
  'LandingPageController',
  'PrintSubmittedApplicationController',
  'RemoveActionPageController',
  'StartClaimPageController',
  'TerminalPageController'
])

/**
 * Grants with a journey definition but no local form definition (e.g. methane,
 * whose pages are defined in code rather than YAML). Nothing to compare.
 */
const NO_FORM_DEFINITION = new Set(['methane'])

// PMF remains deployable, but its dedicated external config repo is not wired
// into local setup yet. Check its journey when an external config is available.
const OPTIONAL_FORM_DEFINITION = new Set(['pigs-might-fly'])

/**
 * Map every grant slug that has a locally synced form definition to its YAML path.
 * @returns {Record<string, string>}
 */
function findFormDefinitions() {
  /** @type {Record<string, string>} */
  const definitions = {}
  for (const slug of exampleGrants) {
    const path = resolve(exampleGrantsDir, slug, 'grants-ui', `${slug}.yaml`)
    if (existsSync(path)) {
      definitions[slug] = path
    }
  }
  for (const dir of existsSync(configBrokerDir) ? readdirSync(configBrokerDir) : []) {
    const [slug] = dir.split('@')
    if (slug === dir || exampleGrants.includes(slug)) {
      continue
    }
    const path = resolve(configBrokerDir, dir, 'grants-ui', `${slug}.yaml`)
    if (existsSync(path)) {
      definitions[slug] = path
    }
  }
  return definitions
}

/**
 * @param {string} path
 * @returns {{path: string, condition?: string, controller?: string}[]}
 */
function readPages(path) {
  return parse(readFileSync(path, 'utf-8')).pages ?? []
}

/**
 * A step's page slug, ignoring any sub-path. `RepeatPageController` steps match
 * `/repeat-page/{itemId}` and `/repeat-page/summary`, both of which belong to the
 * single `/repeat-page` page in the definition.
 * @param {{slug: string}} step
 * @returns {string}
 */
function pageSlug(step) {
  return step.slug.split('/')[0]
}

const journeySlugs = existsSync(journeysDir)
  ? readdirSync(journeysDir)
      .filter((file) => file.endsWith('.json'))
      .map((file) => basename(file, '.json'))
  : []

const formDefinitions = findFormDefinitions()
const comparable = journeySlugs.filter((slug) => formDefinitions[slug])

describe.skipIf(!comparable.length)('journey definitions match their form definitions', () => {
  it('every grant with a journey has a form definition (or is listed as having none)', () => {
    const expected = journeySlugs.filter((slug) => exampleGrants.includes(slug) || existsSync(configBrokerDir))
    const unexplained = expected.filter(
      (slug) => !formDefinitions[slug] && !NO_FORM_DEFINITION.has(slug) && !OPTIONAL_FORM_DEFINITION.has(slug)
    )
    expect(unexplained).toEqual([])
  })

  describe.each(comparable)('%s', (slug) => {
    const steps = JSON.parse(readFileSync(resolve(journeysDir, `${slug}.json`), 'utf-8'))
    const pages = readPages(formDefinitions[slug])
    const pageIndex = new Map(pages.map((page, index) => [page.path.replace(/^\//, ''), index]))

    it('has no step pointing at a page the form definition does not have', () => {
      const unknown = steps.map(pageSlug).filter((slug) => !pageIndex.has(slug))
      expect([...new Set(unknown)]).toEqual([])
    })

    it('does not skip an unconditional page between two steps it does cover', () => {
      const covered = new Set(steps.map(pageSlug))
      const walk = steps.map((step) => pageIndex.get(pageSlug(step))).filter((index) => index !== undefined)

      /** @type {string[]} */
      const skipped = []
      for (let i = 1; i < walk.length; i++) {
        // A backward jump is the journey returning to the task list hub, not a
        // gap in the page walk.
        if (walk[i] <= walk[i - 1]) {
          continue
        }
        for (const page of pages.slice(walk[i - 1] + 1, walk[i])) {
          const path = page.path.replace(/^\//, '')
          if (covered.has(path) || page.condition || OFF_JOURNEY_CONTROLLERS.has(page.controller)) {
            continue
          }
          skipped.push(path)
        }
      }
      expect([...new Set(skipped)]).toEqual([])
    })
  })
})

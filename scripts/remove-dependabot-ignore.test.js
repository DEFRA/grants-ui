import { describe, it, expect } from 'vitest'
import { removeIgnoreRules } from './remove-dependabot-ignore.mjs'

// Mirrors the shape of .github/dependabot.yml: an `ignore` list of commented
// rules, surrounded by unrelated config (groups, a second ecosystem). Kept inline
// so the test stays deterministic as real ignore rules are removed over time.
const FIXTURE = `version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    open-pull-requests-limit: 10
    ignore:
      # eslint 10 is blocked by neostandard, which peers eslint ^9.0.0.
      # Remove this rule when neostandard widens its eslint peer to include ^10.
      - dependency-name: "eslint"
        versions: [">=10.0.0"]
      # joi 18 is blocked by @defra/forms-engine-plugin, which deps joi ^17.13.3.
      - dependency-name: "joi"
        versions: [">=18.0.0"]
      # govuk-frontend 6 is blocked by @defra/forms-engine-plugin.
      - dependency-name: "govuk-frontend"
        versions: [">=6.0.0"]
    groups:
      weekly-dependencies:
        patterns:
          - "*"
  - package-ecosystem: "github-actions"
    directory: /
`

describe('removeIgnoreRules', () => {
  it('removes a single rule and leaves the others intact', () => {
    const { content, removed, notFound } = removeIgnoreRules(FIXTURE, ['joi'])

    expect(notFound).toEqual([])
    expect(removed).toHaveLength(1)
    expect(content).not.toContain('dependency-name: "joi"')
    expect(content).toContain('dependency-name: "eslint"')
    expect(content).toContain('dependency-name: "govuk-frontend"')
  })

  it('removes the contiguous comment block directly above the rule', () => {
    const { content, removed } = removeIgnoreRules(FIXTURE, ['joi'])

    expect(removed[0].lines).toEqual([
      '      # joi 18 is blocked by @defra/forms-engine-plugin, which deps joi ^17.13.3.',
      '      - dependency-name: "joi"',
      '        versions: [">=18.0.0"]'
    ])
    expect(content).not.toContain('joi 18 is blocked')
    // The preceding rule's comment/lines must be untouched.
    expect(content).toContain('# eslint 10 is blocked by neostandard, which peers eslint ^9.0.0.')
    expect(content).toContain('# govuk-frontend 6 is blocked by @defra/forms-engine-plugin.')
  })

  it('removes multiple rules in one call', () => {
    const { content, removed, notFound } = removeIgnoreRules(FIXTURE, ['eslint', 'govuk-frontend'])

    expect(notFound).toEqual([])
    expect(removed.map((r) => r.name)).toEqual(['eslint', 'govuk-frontend'])
    expect(content).not.toContain('dependency-name: "eslint"')
    expect(content).not.toContain('dependency-name: "govuk-frontend"')
    expect(content).toContain('dependency-name: "joi"')
  })

  it('reports unknown names in notFound without throwing or changing content', () => {
    const { content, removed, notFound } = removeIgnoreRules(FIXTURE, ['does-not-exist'])

    expect(removed).toEqual([])
    expect(notFound).toEqual(['does-not-exist'])
    expect(content).toBe(FIXTURE)
  })

  it('handles a mix of known and unknown names', () => {
    const { content, removed, notFound } = removeIgnoreRules(FIXTURE, ['joi', 'nope'])

    expect(removed.map((r) => r.name)).toEqual(['joi'])
    expect(notFound).toEqual(['nope'])
    expect(content).not.toContain('dependency-name: "joi"')
  })

  it('is idempotent — removing an already-absent rule is a no-op', () => {
    const once = removeIgnoreRules(FIXTURE, ['joi']).content
    const twice = removeIgnoreRules(once, ['joi'])

    expect(twice.notFound).toEqual(['joi'])
    expect(twice.content).toBe(once)
  })

  it('leaves unrelated sections and the trailing newline intact', () => {
    const { content } = removeIgnoreRules(FIXTURE, ['joi'])

    expect(content).toContain('weekly-dependencies:')
    expect(content).toContain('package-ecosystem: "github-actions"')
    expect(content.endsWith('\n')).toBe(true)
  })
})

import * as fs from 'node:fs'
import * as os from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  applyLocalOverrideNameSuffix,
  buildDisableScript,
  buildEnableScript,
  bumpPatch,
  dedupeByGrant,
  discoverOverrides,
  filterOverridesBySelection,
  findRepoVersion,
  mongoExecArgs,
  parseSelectionEnv
} from './apply-local-form-defs.mjs'

/** @type {string} */
let tmp
/** @type {string} */
let formDefsDir
/** @type {string} */
let configBrokerLocalDir
/** @type {string} */
let siblingReposDir

beforeEach(() => {
  tmp = fs.mkdtempSync(join(os.tmpdir(), 'apply-local-form-defs-'))
  formDefsDir = join(tmp, 'local-form-definitions')
  configBrokerLocalDir = join(tmp, 'config-broker-local')
  // An isolated, empty sibling-repos dir keeps discovery hermetic — otherwise it
  // would default to the real folder grants-ui lives in and pick up checkouts.
  siblingReposDir = join(tmp, 'siblings')
  fs.mkdirSync(formDefsDir, { recursive: true })
  fs.mkdirSync(configBrokerLocalDir, { recursive: true })
  fs.mkdirSync(siblingReposDir, { recursive: true })
})

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

/** Run discoverOverrides against the isolated temp dirs. */
function discover(overrides = {}) {
  return discoverOverrides({ formDefsDir, configBrokerLocalDir, siblingReposDir, ...overrides })
}

/** Helper to create an override file under <grant>/grants-ui/<file> */
function writeOverride(grant, fileName = `${grant}.yaml`, contents = 'engine: V2\nname: Example\n') {
  const dir = join(formDefsDir, grant, 'grants-ui')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(join(dir, fileName), contents)
}

/** Helper to create a sibling config-repo override at grants-config-<repo>/configurations/<grant>/grants-ui/<file> */
function writeSiblingOverride(repo, grant, fileName = `${grant}.yaml`, contents = 'engine: V2\nname: Example\n') {
  const dir = join(siblingReposDir, `grants-config-${repo}`, 'configurations', grant, 'grants-ui')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(join(dir, fileName), contents)
}

/** Helper to create a pulled grant version folder */
function writeRepoVersion(grant, version) {
  fs.mkdirSync(join(configBrokerLocalDir, `${grant}@${version}`, 'grants-ui'), { recursive: true })
}

describe('bumpPatch', () => {
  it('bumps the patch component by one', () => {
    expect(bumpPatch('1.2.3')).toBe('1.2.4')
    expect(bumpPatch('0.0.9')).toBe('0.0.10')
  })

  it('throws for an invalid version', () => {
    expect(() => bumpPatch('not-a-version')).toThrow(/Invalid semver/)
  })
})

describe('findRepoVersion', () => {
  it('returns the highest semver version folder for the grant', () => {
    writeRepoVersion('woodland', '1.2.3')
    writeRepoVersion('woodland', '1.2.10')
    writeRepoVersion('other', '9.9.9')
    expect(findRepoVersion(configBrokerLocalDir, 'woodland')).toBe('1.2.10')
  })

  it('returns null when the grant was never pulled', () => {
    expect(findRepoVersion(configBrokerLocalDir, 'missing')).toBeNull()
  })

  it('returns null when the config-broker-local folder is absent', () => {
    expect(findRepoVersion(join(tmp, 'nope'), 'woodland')).toBeNull()
  })
})

describe('discoverOverrides', () => {
  it('pairs each override with its bumped repo version', () => {
    writeOverride('woodland')
    writeRepoVersion('woodland', '1.2.3')

    const { overrides, warnings } = discover()

    expect(warnings).toEqual([])
    expect(overrides).toHaveLength(1)
    expect(overrides[0]).toMatchObject({
      id: 'woodland::local',
      grant: 'woodland',
      source: 'local-form-definitions',
      repoVersion: '1.2.3',
      bumpedVersion: '1.2.4'
    })
    expect(overrides[0].file).toMatch(/woodland[/\\]grants-ui[/\\]woodland\.yaml$/)
  })

  it('warns and skips a grant present in overrides but not pulled', () => {
    writeOverride('grasslands')

    const { overrides, warnings } = discover()

    expect(overrides).toEqual([])
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(/grasslands/)
    expect(warnings[0]).toMatch(/not pulled/)
  })

  it('warns when a grant folder has no form-definition file', () => {
    fs.mkdirSync(join(formDefsDir, 'woodland', 'grants-ui'), { recursive: true })
    writeRepoVersion('woodland', '1.2.3')

    const { overrides, warnings } = discover()

    expect(overrides).toEqual([])
    expect(warnings[0]).toMatch(/No form-definition file/)
  })

  it('ignores the committed README and non-directory entries', () => {
    fs.writeFileSync(join(formDefsDir, 'README.md'), '# readme')
    writeOverride('woodland')
    writeRepoVersion('woodland', '2.0.0')

    const { overrides } = discover()

    expect(overrides.map((o) => o.grant)).toEqual(['woodland'])
  })

  it('returns nothing when the overrides folder is empty', () => {
    const { overrides, warnings } = discover()
    expect(overrides).toEqual([])
    expect(warnings).toEqual([])
  })

  it('discovers overrides from a sibling grants-config-* repo', () => {
    writeSiblingOverride('grasslands', 'grasslands')
    writeRepoVersion('grasslands', '0.4.0')

    const { overrides, warnings } = discover()

    expect(warnings).toEqual([])
    expect(overrides).toHaveLength(1)
    expect(overrides[0]).toMatchObject({
      id: 'grasslands::grants-config-grasslands',
      grant: 'grasslands',
      source: 'grants-config-grasslands',
      repoVersion: '0.4.0',
      bumpedVersion: '0.4.1'
    })
    expect(overrides[0].file).toMatch(
      /grants-config-grasslands[/\\]configurations[/\\]grasslands[/\\]grants-ui[/\\]grasslands\.yaml$/
    )
  })

  it('picks the <grant>.yaml form definition over a co-located allowlist.yaml', () => {
    // Real config repos ship an allowlist.yaml beside the form def; it sorts
    // alphabetically before <grant>.yaml but is NOT a form definition.
    writeSiblingOverride('grasslands', 'grasslands', 'allowlist.yaml', 'dev:\n  allowAll: true\n')
    writeSiblingOverride('grasslands', 'grasslands')
    writeRepoVersion('grasslands', '0.4.0')

    const { overrides, warnings } = discover()

    expect(warnings).toEqual([])
    expect(overrides).toHaveLength(1)
    expect(overrides[0].id).toBe('grasslands::grants-config-grasslands')
    expect(overrides[0].file).toMatch(/grants-ui[/\\]grasslands\.yaml$/)
    expect(overrides[0].file).not.toMatch(/allowlist\.yaml$/)
  })

  it('ignores a sibling grants-ui folder that only holds an allowlist.yaml', () => {
    writeSiblingOverride('grasslands', 'grasslands', 'allowlist.yaml', 'dev:\n  allowAll: true\n')
    writeRepoVersion('grasslands', '0.4.0')

    const { overrides, warnings } = discover()

    expect(overrides).toEqual([])
    expect(warnings).toEqual([])
  })

  it('prefers <grant>.yaml over a co-located allowlist.yaml in the local folder', () => {
    const dir = join(formDefsDir, 'grasslands', 'grants-ui')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(join(dir, 'allowlist.yaml'), 'dev:\n  allowAll: true\n')
    fs.writeFileSync(join(dir, 'grasslands.yaml'), 'engine: V2\nname: Example\n')
    writeRepoVersion('grasslands', '0.4.0')

    const { overrides } = discover()

    expect(overrides).toHaveLength(1)
    expect(overrides[0].file).toMatch(/grants-ui[/\\]grasslands\.yaml$/)
  })

  it('lists folder and sibling overrides for the same grant as distinct sources', () => {
    writeOverride('grasslands')
    writeSiblingOverride('grasslands', 'grasslands')
    writeRepoVersion('grasslands', '0.4.0')

    const { overrides } = discover()

    expect(overrides.map((o) => o.id)).toEqual(['grasslands::local', 'grasslands::grants-config-grasslands'])
  })

  it('ignores sibling repos with no grants-ui form definition', () => {
    // A sibling repo that only holds a non-grants-ui service (e.g. an allowlist).
    const dir = join(siblingReposDir, 'grants-config-land-grants', 'configurations', 'land-grants', 'actions')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(join(dir, 'action.yaml'), 'x: 1\n')
    writeRepoVersion('land-grants', '1.0.0')

    const { overrides, warnings } = discover()

    expect(overrides).toEqual([])
    expect(warnings).toEqual([])
  })

  it('ignores sibling directories that are not named grants-config-*', () => {
    const dir = join(siblingReposDir, 'some-other-repo', 'configurations', 'woodland', 'grants-ui')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(join(dir, 'woodland.yaml'), 'engine: V2\n')
    writeRepoVersion('woodland', '1.2.3')

    const { overrides } = discover()

    expect(overrides).toEqual([])
  })
})

describe('parseSelectionEnv', () => {
  it('returns null when unset (act on every override)', () => {
    expect(parseSelectionEnv(undefined)).toBeNull()
  })

  it('splits a comma-separated list into trimmed ids', () => {
    expect(parseSelectionEnv('a::local, b::grants-config-b ,')).toEqual(['a::local', 'b::grants-config-b'])
  })

  it('returns an empty array for an empty string (nothing selected)', () => {
    expect(parseSelectionEnv('')).toEqual([])
  })
})

describe('filterOverridesBySelection', () => {
  const overrides = [
    { id: 'a::local', grant: 'a' },
    { id: 'b::grants-config-b', grant: 'b' }
  ]

  it('returns every override unchanged for a null selection', () => {
    expect(filterOverridesBySelection(overrides, null)).toEqual(overrides)
  })

  it('keeps only the overrides whose id is selected', () => {
    expect(filterOverridesBySelection(overrides, ['b::grants-config-b'])).toEqual([overrides[1]])
  })

  it('returns nothing for an empty selection', () => {
    expect(filterOverridesBySelection(overrides, [])).toEqual([])
  })
})

describe('dedupeByGrant', () => {
  it('keeps the first source per grant and warns about the rest', () => {
    const overrides = [
      { id: 'grasslands::local', grant: 'grasslands', source: 'local-form-definitions' },
      { id: 'grasslands::grants-config-grasslands', grant: 'grasslands', source: 'grants-config-grasslands' }
    ]

    const { overrides: deduped, warnings } = dedupeByGrant(overrides)

    expect(deduped.map((o) => o.id)).toEqual(['grasslands::local'])
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(/Multiple overrides selected for grant "grasslands"/)
  })

  it('leaves distinct grants untouched', () => {
    const overrides = [
      { id: 'a::local', grant: 'a', source: 'local-form-definitions' },
      { id: 'b::grants-config-b', grant: 'b', source: 'grants-config-b' }
    ]

    const { overrides: deduped, warnings } = dedupeByGrant(overrides)

    expect(deduped).toEqual(overrides)
    expect(warnings).toEqual([])
  })
})

describe('applyLocalOverrideNameSuffix', () => {
  it('appends a ` (local override active)` suffix to the name', () => {
    const definition = { engine: 'V2', name: 'Woodland' }
    const result = applyLocalOverrideNameSuffix(definition)
    expect(result.name).toBe('Woodland (local override active)')
    // mutates in place and returns the same object
    expect(result).toBe(definition)
  })

  it('is idempotent and does not stack the suffix', () => {
    const definition = { name: 'Woodland' }
    applyLocalOverrideNameSuffix(definition)
    applyLocalOverrideNameSuffix(definition)
    expect(definition.name).toBe('Woodland (local override active)')
  })

  it('leaves the definition unchanged when there is no property `name`', () => {
    const definition = {}
    applyLocalOverrideNameSuffix(definition)
    expect(definition).toEqual({})
  })
})

describe('buildEnableScript', () => {
  const overrides = [{ grant: 'woodland', file: '/x.yaml', repoVersion: '1.2.3', bumpedVersion: '1.2.4' }]
  const definitionsByGrant = { woodland: { engine: 'V2', name: 'Woodland' } }

  it('embeds the definition and upserts the bumped version', () => {
    const script = buildEnableScript(overrides, { definitionsByGrant })

    expect(script).toContain('config__form_definitions')
    expect(script).toContain('replaceOne')
    // bumped version identity
    expect(script).toContain('"version":"1.2.4"')
    expect(script).toContain('"major":1')
    expect(script).toContain('"minor":2')
    expect(script).toContain('"patch":4')
    // repo version identity is embedded so the base can be selected deterministically
    expect(script).toContain('"patch":3')
    expect(script).toContain(JSON.stringify(definitionsByGrant.woodland))
    expect(script).toContain('RESULT:')
  })

  it('stamps a fresh updatedAt so the forms-engine model cache is invalidated', () => {
    const script = buildEnableScript(overrides, { definitionsByGrant })
    expect(script).toContain('doc.updatedAt = new Date()')
  })

  it('is idempotent: reuses an already-present bumped doc as the template', () => {
    const script = buildEnableScript(overrides, { definitionsByGrant })
    expect(script).toContain('existingBumped')
    expect(script).toContain('const template = base || existingBumped')
  })

  it('polls server-side rather than re-spawning per attempt', () => {
    const script = buildEnableScript(overrides, { definitionsByGrant, waitMs: 5000, pollMs: 250 })
    expect(script).toContain('sleep(CONFIG.pollMs)')
    expect(script).toContain('"waitMs":5000')
    expect(script).toContain('"pollMs":250')
  })

  it('covers every override in a single script', () => {
    const many = [
      { grant: 'woodland', file: '/w.yaml', repoVersion: '1.2.3', bumpedVersion: '1.2.4' },
      { grant: 'grasslands', file: '/g.yaml', repoVersion: '0.4.0', bumpedVersion: '0.4.1' }
    ]
    const script = buildEnableScript(many, {
      definitionsByGrant: { woodland: { a: 1 }, grasslands: { b: 2 } }
    })
    expect(script).toContain('"grant":"woodland"')
    expect(script).toContain('"grant":"grasslands"')
  })
})

describe('mongoExecArgs', () => {
  it('targets the compose file that defines the mongodb service', () => {
    // The stack no longer ships a default `compose.yml` (split into
    // `compose.infra.yml` + `compose.grants-ui.yml` in the floci migration), so
    // `docker compose exec` must be pointed at the file that defines `mongodb`
    // explicitly — otherwise it cannot resolve the service and enabling
    // overrides fails with "Cannot reach the mongodb service".
    const args = mongoExecArgs()
    expect(args.slice(0, 4)).toEqual(['compose', '-f', 'compose.infra.yml', 'exec'])
    expect(args).toContain('mongodb')
    expect(args).toContain('mongosh')
  })
})

describe('buildDisableScript', () => {
  it('deletes the bumped definition and purges dependent state', () => {
    const script = buildDisableScript([{ grant: 'woodland', bumpedVersion: '1.2.4' }])

    expect(script).toContain('config__form_definitions')
    expect(script).toContain('deleteMany')
    expect(script).toContain('state__grant_application_state')
    expect(script).toContain('state__grant_application_locks')
    expect(script).toContain('grantVersion')
    expect(script).toContain('"version":"1.2.4"')
    expect(script).toContain('RESULT:')
  })

  it('covers every override in a single script', () => {
    const script = buildDisableScript([
      { grant: 'woodland', bumpedVersion: '1.2.4' },
      { grant: 'grasslands', bumpedVersion: '0.4.1' }
    ])
    expect(script).toContain('"grant":"woodland"')
    expect(script).toContain('"grant":"grasslands"')
  })

  it('sweeps orphaned docs by the ` (local override active)` marker even with no files', () => {
    // Empty overrides simulates disabling after the source YAML was deleted/moved.
    const script = buildDisableScript([])

    // The marker is embedded so the sweep can find previously-applied overrides
    // that are no longer discoverable from the file system.
    expect(script).toContain(' (local override active)')
    expect(script).toContain('definition.name')
    expect(script).toContain('endsWith(CONFIG.marker)')
    // The orphan still gets its definition doc and dependent state purged.
    expect(script).toContain('deleteOne')
    expect(script).toContain('purgeDependents')
    expect(script).toContain('swept orphaned override')
  })

  it('purges discovered overrides and sweeps orphans in the same script', () => {
    const script = buildDisableScript([{ grant: 'woodland', bumpedVersion: '1.2.4' }])

    // Pass 1 (file-discovered) still removes the bumped version by grant match.
    expect(script).toContain('deleteMany')
    expect(script).toContain('"version":"1.2.4"')
    // Pass 2 (marker sweep) always runs alongside it.
    expect(script).toContain(' (local override active)')
    expect(script).toContain('endsWith(CONFIG.marker)')
  })

  it('omits the orphan marker sweep for a targeted disable (sweepOrphans: false)', () => {
    // A targeted disable removes only the deselected overrides; the shared marker
    // must NOT be swept or it would also purge the overrides kept selected.
    const script = buildDisableScript([{ grant: 'woodland', bumpedVersion: '1.2.4' }], { sweepOrphans: false })

    // Pass 1 still runs for the targeted grant.
    expect(script).toContain('deleteMany')
    expect(script).toContain('"version":"1.2.4"')
    // Pass 2 (marker sweep) is absent.
    expect(script).not.toContain('endsWith(CONFIG.marker)')
    expect(script).not.toContain('swept orphaned override')
  })
})

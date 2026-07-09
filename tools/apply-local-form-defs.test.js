import * as fs from 'node:fs'
import * as os from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  applyLocalOverrideNameSuffix,
  buildDisableScript,
  buildEnableScript,
  bumpPatch,
  discoverOverrides,
  findRepoVersion
} from './apply-local-form-defs.mjs'

/** @type {string} */
let tmp
/** @type {string} */
let formDefsDir
/** @type {string} */
let configBrokerLocalDir

beforeEach(() => {
  tmp = fs.mkdtempSync(join(os.tmpdir(), 'apply-local-form-defs-'))
  formDefsDir = join(tmp, 'local-form-definitions')
  configBrokerLocalDir = join(tmp, 'config-broker-local')
  fs.mkdirSync(formDefsDir, { recursive: true })
  fs.mkdirSync(configBrokerLocalDir, { recursive: true })
})

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

/** Helper to create an override file under <grant>/grants-ui/<file> */
function writeOverride(grant, fileName = `${grant}.yaml`, contents = 'engine: V2\nname: Example\n') {
  const dir = join(formDefsDir, grant, 'grants-ui')
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

    const { overrides, warnings } = discoverOverrides({ formDefsDir, configBrokerLocalDir })

    expect(warnings).toEqual([])
    expect(overrides).toHaveLength(1)
    expect(overrides[0]).toMatchObject({
      grant: 'woodland',
      repoVersion: '1.2.3',
      bumpedVersion: '1.2.4'
    })
    expect(overrides[0].file).toMatch(/woodland[/\\]grants-ui[/\\]woodland\.yaml$/)
  })

  it('warns and skips a grant present in overrides but not pulled', () => {
    writeOverride('grasslands')

    const { overrides, warnings } = discoverOverrides({ formDefsDir, configBrokerLocalDir })

    expect(overrides).toEqual([])
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(/grasslands/)
    expect(warnings[0]).toMatch(/not pulled/)
  })

  it('warns when a grant folder has no form-definition file', () => {
    fs.mkdirSync(join(formDefsDir, 'woodland', 'grants-ui'), { recursive: true })
    writeRepoVersion('woodland', '1.2.3')

    const { overrides, warnings } = discoverOverrides({ formDefsDir, configBrokerLocalDir })

    expect(overrides).toEqual([])
    expect(warnings[0]).toMatch(/No form-definition file/)
  })

  it('ignores the committed README and non-directory entries', () => {
    fs.writeFileSync(join(formDefsDir, 'README.md'), '# readme')
    writeOverride('woodland')
    writeRepoVersion('woodland', '2.0.0')

    const { overrides } = discoverOverrides({ formDefsDir, configBrokerLocalDir })

    expect(overrides.map((o) => o.grant)).toEqual(['woodland'])
  })

  it('returns nothing when the overrides folder is empty', () => {
    const { overrides, warnings } = discoverOverrides({ formDefsDir, configBrokerLocalDir })
    expect(overrides).toEqual([])
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
})

// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { parse } from 'yaml'
import { EXAMPLES_DIRECTORY, prepareAcceptanceSchemas, prepareExampleGrants, ROOT } from './prepare-example-grants.js'

let root
let cache
let source

async function put(relative, body) {
  await mkdir(join(root, relative, '..'), { recursive: true })
  await writeFile(join(root, relative), body)
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'example-grants-test-'))
  cache = join(root, 'compose/config-broker-local')
  source = EXAMPLES_DIRECTORY
  await put(`${source}/example-grant-with-auth/grants-ui/example-grant-with-auth.yaml`, 'name: Example\n')
  await put(`${source}/example-grant-with-auth/grants-ui/allowlist.yaml`, 'local:\n  allowAll: false\n')
  await put(
    `${source}/example-grant-with-auth/gas/gas.json`,
    JSON.stringify({
      code: 'example-grant-with-auth',
      phases: [
        { code: 'PRE_AWARD', questions: { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object' } }
      ]
    })
  )
  await put(`${source}/example-whitelist/grants-ui/example-whitelist.yaml`, 'name: Allowlist\n')
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('checked-in example config preparation', () => {
  it('prepares complete bundles and extracts the questions schema, retaining real grant configs', async () => {
    await put('compose/config-broker-local/woodland@1.2.3/grants-ui/woodland.yaml', 'name: Woodland\n')
    await put('compose/config-broker/local-allowlists/example-grant-with-auth.yaml', 'local:\n  allowAll: true\n')

    const bundles = await prepareExampleGrants({ root })
    const example = bundles.find((bundle) => bundle.grant === 'example-grant-with-auth')
    if (!example) {
      throw new Error('Example grant bundle missing')
    }
    expect(example.version).toBe('3.27.1')
    expect(example.files).toContain('gas/gas.json')
    expect(await readFile(join(example.directory, 'grants-ui/allowlist.yaml'), 'utf8')).toContain('allowAll: true')
    expect(await readFile(join(cache, 'woodland@1.2.3/grants-ui/woodland.yaml'), 'utf8')).toBe('name: Woodland\n')
    expect(parse(await readFile(join(cache, 'release.yml'), 'utf8')).releases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'example-grant-with-auth', version: '3.27.1' }),
        expect.objectContaining({ name: 'woodland', version: '1.2.3' })
      ])
    )
    const schema = JSON.parse(
      await readFile(join(root, 'acceptance/schemas/example-grant-with-auth-submission.schema.json'), 'utf8')
    )
    expect(schema).toEqual({ $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object' })
  })

  it('keeps unchanged bundles stable and bumps only a changed bundle, including when reverting an edit', async () => {
    const initial = await prepareExampleGrants({ root })
    expect((await prepareExampleGrants({ root })).map((bundle) => bundle.version)).toEqual(initial.map(() => '3.27.1'))

    await put(`${source}/example-grant-with-auth/grants-ui/example-grant-with-auth.yaml`, 'name: Edited\n')
    const changed = await prepareExampleGrants({ root })
    expect(changed.map((bundle) => bundle.version)).toEqual(['3.27.2', '3.27.1'])
    await put(`${source}/example-grant-with-auth/grants-ui/example-grant-with-auth.yaml`, 'name: Example\n')
    expect((await prepareExampleGrants({ root }))[0].version).toBe('3.27.3')
  })

  it('bumps the bundle when an effective allowlist or GAS schema changes', async () => {
    await prepareExampleGrants({ root })
    await put('compose/config-broker/local-allowlists/example-grant-with-auth.yaml', 'local:\n  allowAll: true\n')
    expect((await prepareExampleGrants({ root }))[0].version).toBe('3.27.2')
    const gasPath = join(root, source, 'example-grant-with-auth/gas/gas.json')
    const gas = JSON.parse(await readFile(gasPath, 'utf8'))
    gas.phases[0].questions.required = ['answer']
    await writeFile(gasPath, JSON.stringify(gas))
    expect((await prepareExampleGrants({ root }))[0].version).toBe('3.27.3')
  })

  it('stages edited examples above previously downloaded versions without replacing cached real configs', async () => {
    await put(
      'compose/config-broker-local/example-grant-with-auth@3.29.0/grants-ui/example-grant-with-auth.yaml',
      'old'
    )
    await put('compose/config-broker-local/woodland@1.2.3/grants-ui/woodland.yaml', 'name: Woodland\n')
    const target = `${cache}.staging.test`
    await cp(cache, target, { recursive: true })
    expect((await prepareExampleGrants({ root, target }))[0].version).toBe('3.29.1')
    expect(
      await readFile(join(cache, 'example-grant-with-auth@3.29.0/grants-ui/example-grant-with-auth.yaml'), 'utf8')
    ).toBe('old')
    expect(await readFile(join(target, 'woodland@1.2.3/grants-ui/woodland.yaml'), 'utf8')).toBe('name: Woodland\n')
  })

  it('uses published versions to recover when the generated cache is missing or behind the running stack', async () => {
    expect(
      (await prepareExampleGrants({ root, publishedVersions: { 'example-grant-with-auth': ['3.29.0'] } }))[0].version
    ).toBe('3.29.1')
    expect(
      (await prepareExampleGrants({ root, publishedVersions: { 'example-grant-with-auth': ['3.29.1'] } }))[0].version
    ).toBe('3.29.1')
  })

  it.each([false, true])(
    'retires removed examples without removing external config versions (staging: %s)',
    async (staging) => {
      await put(`${source}/pigs-might-fly/grants-ui/pigs-might-fly.yaml`, 'name: PMF\n')
      await prepareExampleGrants({ root })
      await rm(join(root, source, 'pigs-might-fly'), { recursive: true })
      await put('compose/config-broker-local/pigs-might-fly@4.0.0/grants-ui/pigs-might-fly.yaml', 'external PMF')
      await put('compose/config-broker-local/woodland@1.2.3/grants-ui/woodland.yaml', 'external woodland')
      const target = staging ? `${cache}.staging.test` : cache
      if (staging) {
        await cp(cache, target, { recursive: true })
      }

      const bundles = await prepareExampleGrants({ root, target })
      expect(bundles.map(({ grant }) => grant)).not.toContain('pigs-might-fly')
      await expect(readFile(join(target, 'pigs-might-fly@3.27.1/grants-ui/pigs-might-fly.yaml'))).rejects.toMatchObject(
        { code: 'ENOENT' }
      )
      expect(await readFile(join(target, 'pigs-might-fly@4.0.0/grants-ui/pigs-might-fly.yaml'), 'utf8')).toBe(
        'external PMF'
      )
      expect(await readFile(join(target, 'woodland@1.2.3/grants-ui/woodland.yaml'), 'utf8')).toBe('external woodland')
      const releases = parse(await readFile(join(target, 'release.yml'), 'utf8')).releases
      expect(releases.find(({ name }) => name === 'pigs-might-fly')).toMatchObject({ version: '4.0.0' })
      expect(JSON.parse(await readFile(join(target, '.example-grants.json'), 'utf8'))).not.toHaveProperty(
        'pigs-might-fly'
      )
      if (staging) {
        expect(await readFile(join(cache, 'pigs-might-fly@3.27.1/grants-ui/pigs-might-fly.yaml'), 'utf8')).toBe(
          'name: PMF\n'
        )
      }
    }
  )

  it('omits a retired example from releases when there is no external replacement', async () => {
    await put(`${source}/pigs-might-fly/grants-ui/pigs-might-fly.yaml`, 'name: PMF\n')
    await prepareExampleGrants({ root })
    await rm(join(root, source, 'pigs-might-fly'), { recursive: true })
    await prepareExampleGrants({ root })
    expect(parse(await readFile(join(cache, 'release.yml'), 'utf8')).releases.map(({ name }) => name)).not.toContain(
      'pigs-might-fly'
    )
  })

  it('preserves newly downloaded external replacements even when they reuse the former example version', async () => {
    await put(`${source}/pigs-might-fly/grants-ui/pigs-might-fly.yaml`, 'name: PMF\n')
    await prepareExampleGrants({ root })
    await rm(join(root, source, 'pigs-might-fly'), { recursive: true })
    const target = `${cache}.staging.external`
    await put(
      'compose/config-broker-local.staging.external/pigs-might-fly@3.27.1/grants-ui/pigs-might-fly.yaml',
      'external PMF'
    )

    await prepareExampleGrants({ root, target })
    expect(await readFile(join(target, 'pigs-might-fly@3.27.1/grants-ui/pigs-might-fly.yaml'), 'utf8')).toBe(
      'external PMF'
    )
    expect(parse(await readFile(join(target, 'release.yml'), 'utf8')).releases).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'pigs-might-fly', version: '3.27.1' })])
    )
  })

  it('rejects targets outside the generated tree before writing or removing config', async () => {
    await expect(prepareExampleGrants({ root, target: root })).rejects.toThrow('Example config target')
  })

  it('builds a fresh config cache with every checked-in local allowlist', async () => {
    await mkdir(join(root, 'tools'), { recursive: true })
    for (const script of ['setup-local-config.sh', 'prepare-example-grants.js', 'replace-directory-contents.js']) {
      await cp(join(ROOT, 'tools', script), join(root, 'tools', script))
    }
    await cp(
      join(ROOT, 'compose/config-broker/local-allowlists'),
      join(root, 'compose/config-broker/local-allowlists'),
      {
        recursive: true
      }
    )
    await put('package.json', '{"type":"module"}')
    await mkdir(join(root, 'bin'), { recursive: true })
    await writeFile(
      join(root, 'bin/curl'),
      `#!${process.execPath}
import fs from 'node:fs'
const args = process.argv.slice(2)
const url = new URL(args.find((arg) => arg.startsWith('https://')))
const repo = url.pathname.split('/')[url.hostname === 'api.github.com' ? 3 : 2]
const grant = repo.replace('grants-config-', '')
if (url.pathname.endsWith('/tags')) {
  process.stdout.write(JSON.stringify([{ name: 'v1.2.3' }]))
} else if (url.pathname.includes('/git/trees/')) {
  process.stdout.write(JSON.stringify({ tree: [
    { type: 'blob', path: 'configurations/' + grant + '/grants-ui/allowlist.yaml' }
  ] }))
} else {
  fs.writeFileSync(args[args.indexOf('--output') + 1], 'local:\\n  allowAll: false\\n')
}
`,
      { mode: 0o755 }
    )
    const result = spawnSync('bash', ['tools/setup-local-config.sh'], {
      cwd: root,
      env: { ...process.env, PATH: `${join(root, 'bin')}:${process.env.PATH}` },
      encoding: 'utf8'
    })

    expect(result.stderr).not.toContain('Failed')
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Config broker local folder rebuilt')
    for (const grant of ['woodland', 'farm-payments', 'grasslands', 'water-management']) {
      expect(await readFile(join(cache, `${grant}@1.2.3/grants-ui/allowlist.yaml`), 'utf8')).toBe(
        await readFile(join(ROOT, `compose/config-broker/local-allowlists/${grant}.yaml`), 'utf8')
      )
    }
    expect(await readFile(join(cache, 'land-grants@1.2.3/grants-ui/allowlist.yaml'), 'utf8')).toContain(
      'allowAll: false'
    )
    expect(
      await readFile(join(cache, 'example-grant-with-auth@3.27.1/grants-ui/example-grant-with-auth.yaml'), 'utf8')
    ).toBe('name: Example\n')
    expect(parse(await readFile(join(cache, 'release.yml'), 'utf8')).releases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'woodland', version: '1.2.3' }),
        expect.objectContaining({ name: 'example-grant-with-auth', version: '3.27.1' })
      ])
    )
  })

  it('refreshes examples from the checkout when real config downloads fail and a cache exists', async () => {
    await put('compose/config-broker-local/woodland@1.2.3/grants-ui/woodland.yaml', 'cached woodland')
    await mkdir(join(root, 'tools'), { recursive: true })
    for (const script of ['setup-local-config.sh', 'prepare-example-grants.js', 'replace-directory-contents.js']) {
      await cp(join(ROOT, 'tools', script), join(root, 'tools', script))
    }
    await put('package.json', '{"type":"module"}')
    await mkdir(join(root, 'bin'), { recursive: true })
    await writeFile(join(root, 'bin/curl'), '#!/bin/sh\nexit 22\n', { mode: 0o755 })
    const result = spawnSync('bash', ['tools/setup-local-config.sh'], {
      cwd: root,
      env: { ...process.env, PATH: `${join(root, 'bin')}:${process.env.PATH}` },
      encoding: 'utf8'
    })
    expect({ status: result.status, error: result.error?.message, stderr: result.stderr }).toMatchObject({ status: 0 })
    expect(result.stderr).toContain('continuing offline')
    expect(await readFile(join(cache, 'woodland@1.2.3/grants-ui/woodland.yaml'), 'utf8')).toBe('cached woodland')
    expect(
      await readFile(join(cache, 'example-grant-with-auth@3.27.1/grants-ui/example-grant-with-auth.yaml'), 'utf8')
    ).toBe('name: Example\n')
  })

  it('prepares every imported config and its JSON schema without an external repo or npm setup', async () => {
    await cp(join(ROOT, EXAMPLES_DIRECTORY), join(root, source), { recursive: true })
    const bundles = await prepareExampleGrants({ root })
    expect(bundles.map((bundle) => bundle.grant).sort()).toEqual([
      'example-grant-with-auth',
      'example-grant-with-closed-window',
      'example-grant-with-map',
      'example-grant-with-task-list',
      'example-grant-with-task-list-hide-questions',
      'example-whitelist'
    ])
    expect(bundles.find((bundle) => bundle.grant === 'example-grant-with-auth')?.files).toContain('gas/gas.json')
    for (const { grant, directory } of bundles) {
      const allowlist = parse(await readFile(join(ROOT, EXAMPLES_DIRECTORY, grant, 'grants-ui/allowlist.yaml'), 'utf8'))
      expect(Object.keys(allowlist)).toEqual(['local'])
      if (grant === 'example-whitelist') {
        expect(allowlist.local.allowAll).not.toBe(true)
        expect(allowlist.local.crns.length).toBeGreaterThan(0)
        expect(allowlist.local.sbis.length).toBeGreaterThan(0)
      } else {
        expect(allowlist).toEqual({ local: { allowAll: true } })
      }
      // A fresh checkout needs no local-allowlists overlay to prepare local access.
      expect(parse(await readFile(join(directory, 'grants-ui/allowlist.yaml'), 'utf8'))).toEqual(allowlist)
    }
    await prepareAcceptanceSchemas(root)
    const schema = JSON.parse(
      await readFile(join(root, 'acceptance/schemas/example-grant-with-auth-submission.schema.json'), 'utf8')
    )
    expect(schema.required).toContain('yesNoField')
    expect(schema.properties).toHaveProperty('referenceNumber')
    expect(schema.properties.detailsConfirmed).toEqual({ type: 'boolean' })
    expect(schema.properties.ukAddressField__uprn).toEqual({ type: ['string', 'null'] })
    expect(schema.properties.totalHectaresForSelectedParcels).toEqual({ type: 'number' })
  })
})

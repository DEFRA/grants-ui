// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ROOT } from './prepare-example-grants.js'

let root

async function put(relative, body, options) {
  await mkdir(join(root, relative, '..'), { recursive: true })
  await writeFile(join(root, relative), body, options)
}

function setup(env = {}) {
  return spawnSync('bash', ['tools/setup-local-config.sh'], {
    cwd: root,
    env: {
      ...process.env,
      GITHUB_TOKEN: '',
      GH_TOKEN: '',
      TEST_GH_TOKEN: '',
      TEST_EXPECTED_TOKEN: 'test-private-token',
      TEST_FAIL_DOWNLOAD: '',
      ...env,
      PATH: `${join(root, 'bin')}:${process.env.PATH}`
    },
    encoding: 'utf8'
  })
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'config-auth-test-'))
  await mkdir(join(root, 'tools'), { recursive: true })
  for (const script of ['setup-local-config.sh', 'prepare-example-grants.js', 'replace-directory-contents.js']) {
    await cp(join(ROOT, 'tools', script), join(root, 'tools', script))
  }
  await put('package.json', '{"type":"module"}')
  await put('compose/config-broker/example-grants/example-grant-with-auth/grants-ui/form.yaml', 'name: Example\n')
  await put(
    'compose/config-broker/example-grants/example-grant-with-auth/gas/gas.json',
    JSON.stringify({
      phases: [{ code: 'PRE_AWARD', questions: { $schema: 'https://json-schema.org/draft/2020-12/schema' } }]
    })
  )
  await put(
    'bin/gh',
    `#!${process.execPath}
import fs from 'node:fs'
fs.appendFileSync('gh-requests.jsonl', JSON.stringify(process.argv.slice(2)) + '\\n')
if (!process.env.TEST_GH_TOKEN) process.exit(1)
process.stdout.write(process.env.TEST_GH_TOKEN + '\\n')
`,
    { mode: 0o755 }
  )
  await put(
    'bin/curl',
    `#!${process.execPath}
import fs from 'node:fs'
const args = process.argv.slice(2)
fs.appendFileSync('curl-requests.jsonl', JSON.stringify(args) + '\\n')
const url = new URL(args.find((arg) => arg.startsWith('https://')))
if (!args.includes('Authorization: Bearer ' + process.env.TEST_EXPECTED_TOKEN)) process.exit(22)
if (url.hostname !== 'api.github.com') process.exit(22)
const grant = url.pathname.split('/')[3].replace('grants-config-', '')
if (url.pathname.endsWith('/tags')) {
  process.stdout.write(JSON.stringify([{ name: 'v1.2.3' }]))
} else if (url.pathname.includes('/git/trees/')) {
  process.stdout.write(JSON.stringify({ tree: [
    { type: 'blob', path: 'configurations/' + grant + '/grants-ui/form.yaml' }
  ] }))
} else if (url.pathname.includes('/contents/')) {
  if (!args.includes('Accept: application/vnd.github.raw+json')) process.exit(22)
  if (!args.includes('--get') || !args.includes('ref=v1.2.3')) process.exit(22)
  const output = args[args.indexOf('--output') + 1]
  fs.writeFileSync(output, 'name: Downloaded config\\n')
  if (process.env.TEST_FAIL_DOWNLOAD) process.exit(22)
} else {
  process.exit(22)
}
`,
    { mode: 0o755 }
  )
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('private config repo authentication', () => {
  it.each([
    ['GITHUB_TOKEN', { GITHUB_TOKEN: 'test-private-token', GH_TOKEN: 'unused-token' }],
    ['GH_TOKEN', { GH_TOKEN: 'test-private-token' }],
    ['GitHub CLI', { TEST_GH_TOKEN: 'test-private-token' }]
  ])('builds an empty cache using %s for metadata and file downloads', async (source, env) => {
    const result = setup(env)

    expect({ status: result.status, stderr: result.stderr }).toMatchObject({ status: 0 })
    expect(result.stdout).toContain('Config broker local folder rebuilt')
    const requests = (await readFile(join(root, 'curl-requests.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    expect(requests).toHaveLength(12)
    for (const grant of ['farm-payments', 'grasslands', 'land-grants', 'water-management']) {
      expect(await readFile(join(root, `compose/config-broker-local/${grant}@1.2.3/grants-ui/form.yaml`), 'utf8')).toBe(
        'name: Downloaded config\n'
      )
    }
    expect(result.stdout + result.stderr).not.toContain('test-private-token')
    if (source === 'GitHub CLI') {
      expect(await readFile(join(root, 'gh-requests.jsonl'), 'utf8')).toBe(
        '["auth","token","--hostname","github.com"]\n'
      )
    } else {
      await expect(readFile(join(root, 'gh-requests.jsonl'))).rejects.toMatchObject({ code: 'ENOENT' })
    }
  })

  it('explains how to authenticate when GitHub CLI is signed out and no cache exists', async () => {
    const result = setup()

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('gh auth login --hostname github.com')
    expect(result.stderr).toContain('GITHUB_TOKEN / GH_TOKEN')
    expect(result.stderr).toContain('No cached config found')
    expect(await readdir(join(root, 'compose'))).not.toContainEqual(expect.stringContaining('.staging.'))
  })

  it('does not replace an explicit invalid token with the GitHub CLI account', async () => {
    const result = setup({ GITHUB_TOKEN: 'invalid-token', TEST_GH_TOKEN: 'test-private-token' })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('read access to the DEFRA config repos')
    expect(result.stdout + result.stderr).not.toContain('invalid-token')
    await expect(readFile(join(root, 'gh-requests.jsonl'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it.each([false, true])(
    'preserves the cache after an authentication failure (file download: %s)',
    async (download) => {
      const cached = 'compose/config-broker-local/woodland@1.0.0/grants-ui/form.yaml'
      await put(cached, 'name: Cached config\n')

      const result = setup(download ? { GITHUB_TOKEN: 'test-private-token', TEST_FAIL_DOWNLOAD: '1' } : {})

      expect(result.status).toBe(0)
      expect(result.stderr).toContain('continuing offline')
      expect(result.stderr).toContain('gh auth login')
      expect(await readFile(join(root, cached), 'utf8')).toBe('name: Cached config\n')
      expect(await readdir(join(root, 'compose'))).not.toContainEqual(expect.stringContaining('.staging.'))
      await expect(
        readFile(join(root, 'compose/config-broker-local/woodland@1.2.3/grants-ui/form.yaml'))
      ).rejects.toMatchObject({ code: 'ENOENT' })
    }
  )
})

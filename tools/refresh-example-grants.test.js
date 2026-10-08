// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { prepareExampleGrants } from './prepare-example-grants.js'
import { publishedVersionsScript, refreshExampleGrants, resetApplicationsScript } from './refresh-example-grants.js'
import { runInNewContext } from 'node:vm'

const fixture = vi.hoisted(() => ({ root: '', directory: '' }))
vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }))
vi.mock('./prepare-example-grants.js', async (importOriginal) => ({
  ...(await importOriginal()),
  get ROOT() {
    return fixture.root
  },
  prepareExampleGrants: vi.fn()
}))

beforeEach(async () => {
  vi.clearAllMocks()
  fixture.root = await mkdtemp(join(tmpdir(), 'refresh-examples-test-'))
  fixture.directory = join(fixture.root, 'compose/config-broker/example-grants/example-grant-with-auth')
  await mkdir(join(fixture.directory, 'grants-ui'), { recursive: true })
  await mkdir(join(fixture.directory, 'gas'), { recursive: true })
  await writeFile(join(fixture.directory, 'grants-ui/example-grant-with-auth.yaml'), 'name: Edited example\n')
  await writeFile(join(fixture.directory, 'gas/gas.json'), '{"code":"example-grant-with-auth"}')
  vi.mocked(prepareExampleGrants).mockResolvedValue([
    {
      grant: 'example-grant-with-auth',
      version: '3.27.2',
      directory: fixture.directory,
      files: ['gas/gas.json', 'grants-ui/example-grant-with-auth.yaml']
    }
  ])
  vi.mocked(spawnSync).mockImplementation((_command, args = []) => {
    const stdout = args.includes('mongosh')
      ? args.at(-1)?.includes('const versions')
        ? 'EXAMPLES:{"example-grant-with-auth":["3.27.1"]}\n'
        : 'EXAMPLES:true\n'
      : '{}\n'
    return { status: 0, stdout, stderr: '', pid: 1, output: [], signal: null }
  })
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(async () => {
  vi.restoreAllMocks()
  await rm(fixture.root, { recursive: true, force: true })
})

test('refresh uploads the full bundle and asks the broker to publish it, retaining application state', async () => {
  await refreshExampleGrants()
  expect(prepareExampleGrants).toHaveBeenCalledWith({ publishedVersions: { 'example-grant-with-auth': ['3.27.1'] } })
  const calls = vi.mocked(spawnSync).mock.calls
  const uploads = calls.filter(([, args]) => args?.includes('s3'))
  expect(uploads).toHaveLength(2)
  expect(uploads[0][1]).toContain('s3://configs-bucket/example-grant-with-auth/3.27.2/gas/gas.json')
  expect(uploads[1][2]?.input?.toString()).toBe('name: Edited example\n')
  const message = calls.find(([, args]) => args?.includes('send-message'))?.[1]?.at(-1)
  expect(JSON.parse(String(message))).toEqual({
    grant: 'example-grant-with-auth',
    version: '3.27.2',
    status: 'active',
    user: 'local-development',
    files: [
      'example-grant-with-auth/3.27.2/gas/gas.json',
      'example-grant-with-auth/3.27.2/grants-ui/example-grant-with-auth.yaml'
    ]
  })
  expect(calls.some(([, args]) => args?.at(-1)?.includes('deleteMany'))).toBe(false)
  expect(calls.at(-1)?.[1]?.at(-1)).toContain('config__form_definitions')
})

test('dry-run makes no Docker calls and does not rewrite generated config', async () => {
  await refreshExampleGrants({ dryRun: true, resetApplications: true })
  expect(spawnSync).not.toHaveBeenCalled()
  expect(prepareExampleGrants).not.toHaveBeenCalled()
})

test('a failed upload stops before release or application reset', async () => {
  vi.mocked(spawnSync).mockImplementation((_command, args = []) => ({
    status: args.includes('s3') ? 1 : 0,
    stdout: 'EXAMPLES:{}\n',
    stderr: 'Upload failed',
    pid: 1,
    output: [],
    signal: null
  }))
  await expect(refreshExampleGrants({ resetApplications: true })).rejects.toThrow('Upload failed')
  expect(vi.mocked(spawnSync).mock.calls.some(([, args]) => args?.includes('send-message'))).toBe(false)
  expect(vi.mocked(spawnSync).mock.calls.some(([, args]) => args?.at(-1)?.includes('deleteMany'))).toBe(false)
})

test('reset runs only after the new example definitions are ready', async () => {
  await refreshExampleGrants({ resetApplications: true })
  const scripts = vi.mocked(spawnSync).mock.calls.map(([, args]) => args?.at(-1))
  expect(scripts.at(-2)).toContain('config__form_definitions')
  expect(scripts.at(-1)).toContain('deleteMany')
})

test('version discovery includes backend-only override versions to avoid ingestion collisions', () => {
  const brokerFind = vi.fn(() => [{ grant: 'example-grant-with-auth', version: '3.27.1' }])
  const backendFind = vi.fn(() => [{ grantCode: 'example-grant-with-auth', major: 3, minor: 27, patch: 2 }])
  const print = vi.fn()
  runInNewContext(publishedVersionsScript(['example-grant-with-auth']), {
    db: {
      getSiblingDB: () => ({ getCollection: () => ({ find: brokerFind }) }),
      getCollection: () => ({ find: backendFind })
    },
    print
  })
  expect(brokerFind).toHaveBeenCalledWith({ grant: { $in: ['example-grant-with-auth'] } })
  expect(backendFind).toHaveBeenCalledWith({ grantCode: { $in: ['example-grant-with-auth'] } })
  expect(print).toHaveBeenCalledWith('EXAMPLES:{"example-grant-with-auth":["3.27.1","3.27.2"]}')
})

test('the explicit reset script scopes every deletion to example grant codes', () => {
  const deleteMany = vi.fn((filter) => ({ deletedCount: filter.grantCode ? 2 : 0 }))
  const print = vi.fn()
  runInNewContext(resetApplicationsScript(['example-grant-with-auth']), {
    db: { getCollection: () => ({ deleteMany }) },
    print
  })
  expect(deleteMany).toHaveBeenCalledTimes(5)
  for (const [filter] of deleteMany.mock.calls) {
    expect(filter).toEqual({ grantCode: { $in: ['example-grant-with-auth'] } })
  }
  expect(print).toHaveBeenCalledWith(expect.stringContaining('EXAMPLES:'))
})

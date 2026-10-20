// @vitest-environment node
import { beforeEach, expect, test, vi } from 'vitest'
import { spawnSync } from 'node:child_process'
import { statSync } from 'node:fs'
import { resolve } from 'node:path'
import { ROOT } from './constants.js'
import { buildLocalImage, getLocalServiceRepo } from './local-images.js'

vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }))
vi.mock('node:fs', () => ({ statSync: vi.fn() }))

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(statSync, { partial: true }).mockReturnValue({ isFile: () => true })
})

test('discovers a service next to the repo root independently of the working directory', () => {
  expect(getLocalServiceRepo('grants-ui-backend', '/checkouts/grants-ui')).toBe('/checkouts/grants-ui-backend')
  expect(statSync).toHaveBeenCalledWith('/checkouts/grants-ui-backend/Dockerfile')
})

test('ignores unknown service names and paths', () => {
  expect(getLocalServiceRepo('../other-repo')).toBeNull()
  expect(statSync).not.toHaveBeenCalled()
})

test('requires a readable Dockerfile that is a file', () => {
  vi.mocked(statSync, { partial: true })
    .mockReturnValueOnce({ isFile: () => false })
    .mockImplementationOnce(() => {
      throw new Error('ENOENT')
    })
  expect(getLocalServiceRepo('grants-ui-backend')).toBeNull()
  expect(getLocalServiceRepo('grants-ui-backend')).toBeNull()
})

test.each([0, 1, null])('builds with the standard tag and returns Docker status %s', (status) => {
  vi.mocked(spawnSync, { partial: true }).mockReturnValue({ status })
  expect(buildLocalImage('grants-ui-backend')).toBe(status ?? 1)
  expect(spawnSync).toHaveBeenCalledWith('docker', ['build', '-t', 'grants-ui-backend:local', '.'], {
    cwd: resolve(ROOT, '..', 'grants-ui-backend'),
    stdio: 'inherit'
  })
})

test('dry run skips Docker', () => {
  expect(buildLocalImage('grants-ui-backend', true)).toBe(0)
  expect(spawnSync).not.toHaveBeenCalled()
})

test('rechecks the checkout before building', () => {
  vi.mocked(statSync).mockImplementationOnce(() => {
    throw new Error('ENOENT')
  })
  expect(buildLocalImage('grants-ui-backend')).toBe(1)
  expect(spawnSync).not.toHaveBeenCalled()
})

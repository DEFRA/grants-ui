// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, expect, test, vi } from 'vitest'
import { ADDONS, RESET_IMAGES, ROOT, TEST_TARGETS } from './constants.js'

const NON_ADDON_COMPOSE_FILES = [
  'compose.ci.yml',
  'compose.grants-ui.yml',
  'compose.infra.yml',
  'compose.journey-runner.yml',
  'compose.sonar.yml',
  'compose.tests.yml'
]

const NON_TARGET_TEST_SCRIPTS = ['test:unit', 'test:stryker', 'test:watch', 'test:acceptance:rebuild']

const { scripts } = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'))
const originalIsTTY = process.stdout.isTTY

afterEach(() => {
  process.stdout.isTTY = originalIsTTY
  vi.unstubAllEnvs()
})

test('GT_THEME=default uses the standard appearance and colour aliases', async () => {
  process.stdout.isTTY = true
  vi.stubEnv('TERM', 'xterm-256color')
  vi.stubEnv('NO_COLOR', '')
  vi.stubEnv('GT_THEME', 'default')
  vi.resetModules()
  const constants = await import('./constants.js')
  expect(constants.ACCENT).toBe('\x1b[36m')
  expect(constants.GREEN).toBe(constants.THEME.colours.success)
  expect(constants.RED).toBe(constants.THEME.colours.error)
  expect(constants.ARROW).toBe(constants.IS_WINDOWS ? '>' : '❯')
  const { HEADER } = await import('./tui.js')
  expect(HEADER.join('\n')).toContain(constants.IS_WINDOWS ? 'Grants TUI' : constants.THEME.wordmark[0])
  expect(HEADER).toHaveLength(constants.IS_WINDOWS ? 4 : 6)
})

test.each(['pipe', 'NO_COLOR', 'dumb'])('theme colours respect %s output', async (mode) => {
  process.stdout.isTTY = mode !== 'pipe'
  vi.stubEnv('GT_THEME', 'default')
  vi.stubEnv('TERM', mode === 'dumb' ? 'dumb' : 'xterm-256color')
  vi.stubEnv('NO_COLOR', mode === 'NO_COLOR' ? '1' : '')
  vi.resetModules()
  const { THEME } = await import('./constants.js')
  expect(Object.values(THEME.colours).every((colour) => colour === '')).toBe(true)
})

test('every root compose.*.yml is an addon or explicitly not one', () => {
  const composeFiles = readdirSync(ROOT).filter((f) => /^compose\..+\.yml$/.test(f))
  const known = [...ADDONS.map((a) => a.composeFile), ...NON_ADDON_COMPOSE_FILES]
  expect(
    composeFiles.filter((f) => !known.includes(f)),
    'compose files not in ADDONS or NON_ADDON_COMPOSE_FILES'
  ).toEqual([])
  expect(
    known.filter((f) => !composeFiles.includes(f)),
    'listed compose files that no longer exist'
  ).toEqual([])
})

test('every test target runs an existing npm script', () => {
  expect(TEST_TARGETS.map((t) => t.script).filter((s) => !(s in scripts))).toEqual([])
})

test('every npm test script is a test target or explicitly not one', () => {
  const testScripts = Object.keys(scripts).filter((s) => s === 'test' || s.startsWith('test:'))
  const known = [...TEST_TARGETS.map((t) => t.script), ...NON_TARGET_TEST_SCRIPTS]
  expect(
    testScripts.filter((s) => !known.includes(s)),
    'test scripts not in TEST_TARGETS or NON_TARGET_TEST_SCRIPTS'
  ).toEqual([])
  expect(
    NON_TARGET_TEST_SCRIPTS.filter((s) => !testScripts.includes(s)),
    'listed test scripts that no longer exist'
  ).toEqual([])
})

test('reset removes the same images as the docker:reset npm script', () => {
  const rmiArgs = scripts['docker:reset'].match(/docker rmi -f ([^;&|]+?)\s*2>/)?.[1].split(/\s+/)
  expect(rmiArgs, 'could not find the `docker rmi -f … 2>` list in docker:reset').toBeDefined()
  expect([...RESET_IMAGES].sort()).toEqual([...(rmiArgs ?? [])].sort())
})

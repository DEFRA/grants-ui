// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from 'vitest'
import { ADDONS, LOCAL_SERVICES, ROOT, TEST_TARGETS } from './constants.js'

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
  const resetImages = LOCAL_SERVICES.filter((s) => s.removeOnReset).map((s) => s.image)
  expect(rmiArgs, 'could not find the `docker rmi -f … 2>` list in docker:reset').toBeDefined()
  expect([...resetImages].sort()).toEqual([...(rmiArgs ?? [])].sort())
})

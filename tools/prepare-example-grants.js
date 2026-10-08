#!/usr/bin/env node
/* eslint-disable no-console */

import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
export const EXAMPLES_DIRECTORY = 'compose/config-broker/example-grants'
const STATE_FILE = '.example-grants.json'
// Initial technical version from the imported main branch. Developers never
// bump this: changed bundles receive a local patch version automatically.
const INITIAL_VERSION = '3.27.1'

export function compareVersions(a, b) {
  const left = a.split('.').map(Number)
  const right = b.split('.').map(Number)
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2]
}

export function nextVersion(versions) {
  const latest = [INITIAL_VERSION, ...versions].sort(compareVersions).at(-1)
  const [major, minor, patch] = latest.split('.').map(Number)
  return `${major}.${minor}.${patch + 1}`
}

async function readState(directory) {
  try {
    return JSON.parse(await readFile(join(directory, STATE_FILE), 'utf8'))
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error
    }
    return {}
  }
}

async function filesIn(directory, prefix = '') {
  const files = []
  for (const entry of await readdir(join(directory, prefix), { withFileTypes: true })) {
    const relative = join(prefix, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await filesIn(directory, relative)))
    } else if (entry.isFile()) {
      files.push(relative)
    } else {
      throw new Error(`Example configs must contain regular files: ${relative}`)
    }
  }
  return files.sort()
}

export async function prepareAcceptanceSchemas(root = ROOT) {
  const directory = join(root, 'acceptance/schemas')
  await mkdir(directory, { recursive: true })
  const gas = JSON.parse(await readFile(join(root, EXAMPLES_DIRECTORY, 'example-grant-with-auth/gas/gas.json'), 'utf8'))
  const schema = gas.phases?.find((phase) => phase.code === 'PRE_AWARD')?.questions
  if (!schema?.$schema) {
    throw new Error('Example grant GAS config must contain the PRE_AWARD questions schema')
  }
  await writeFile(
    join(directory, 'example-grant-with-auth-submission.schema.json'),
    JSON.stringify(schema, null, 2) + '\n'
  )
}

/** Prepare complete bundles, including effective local allowlists, without npm dependencies. */
export async function prepareExampleGrants({
  root = ROOT,
  target = join(root, 'compose/config-broker-local'),
  publishedVersions = {}
} = {}) {
  const cache = join(root, 'compose/config-broker-local')
  if (resolve(target) !== resolve(cache) && !resolve(target).startsWith(`${resolve(cache)}.staging.`)) {
    throw new Error('Example config target must be config-broker-local or its staging directory')
  }
  const previous = await readState(cache)
  const cachedEntries = await readdir(cache).catch((error) => {
    if (error.code !== 'ENOENT') {
      throw error
    }
    return []
  })
  const source = join(root, EXAMPLES_DIRECTORY)
  const grants = (await readdir(source, { withFileTypes: true })).filter((entry) => entry.isDirectory())
  const state = {}
  const bundles = []
  await mkdir(target, { recursive: true })

  // Retire only bundles this tool generated. Other versions may belong to an
  // external config repo, so leave those (and all application data) untouched.
  const currentGrants = new Set(grants.map((entry) => entry.name))
  const managed = resolve(target) === resolve(cache) ? previous : await readState(target)
  for (const [grant, record] of Object.entries(managed)) {
    if (!currentGrants.has(grant) && /^[a-z0-9-]+$/.test(grant) && /^\d+\.\d+\.\d+$/.test(record.version)) {
      await rm(join(target, `${grant}@${record.version}`), { recursive: true, force: true })
    }
  }

  for (const { name: grant } of grants) {
    if (!/^[a-z0-9-]+$/.test(grant)) {
      throw new Error(`Invalid example grant directory: ${grant}`)
    }
    const files = []
    for (const relative of await filesIn(join(source, grant))) {
      let content = await readFile(join(source, grant, relative))
      if (relative === join('grants-ui', 'allowlist.yaml')) {
        const allowlist = join(root, 'compose/config-broker/local-allowlists', `${grant}.yaml`)
        content = await readFile(allowlist).catch((error) => {
          if (error.code !== 'ENOENT') {
            throw error
          }
          return content
        })
      }
      files.push({ relative, content })
    }
    const hash = createHash('sha256')
    for (const { relative, content } of files) {
      hash.update(relative).update('\0').update(content).update('\0')
    }
    const digest = hash.digest('hex')
    const versions = [
      ...cachedEntries.filter((entry) => entry.startsWith(`${grant}@`)).map((entry) => entry.split('@')[1]),
      ...(publishedVersions[grant] ?? [])
    ].filter((version) => /^\d+\.\d+\.\d+$/.test(version))
    const old = previous[grant]
    const newerExists = old && versions.some((version) => compareVersions(version, old.version) > 0)
    const version =
      old?.digest === digest && !newerExists ? old.version : versions.length ? nextVersion(versions) : INITIAL_VERSION
    const directory = join(target, `${grant}@${version}`)
    // Remove only this example's generated folders, retaining the mount root.
    for (const entry of await readdir(target)) {
      if (entry.startsWith(`${grant}@`) && /^\d+\.\d+\.\d+$/.test(entry.split('@')[1])) {
        await rm(join(target, entry), { recursive: true, force: true })
      }
    }
    for (const { relative, content } of files) {
      await mkdir(join(directory, relative, '..'), { recursive: true })
      await writeFile(join(directory, relative), content)
    }
    state[grant] = { version, digest }
    bundles.push({ grant, version, directory, files: files.map((file) => file.relative) })
  }
  await writeFile(join(target, STATE_FILE), JSON.stringify(state, null, 2) + '\n')
  await writeReleaseFile(target)
  await prepareAcceptanceSchemas(root)
  return bundles
}

async function writeReleaseFile(directory) {
  const versions = new Map()
  for (const entry of await readdir(directory)) {
    const match = /^([a-z0-9-]+)@(\d+\.\d+\.\d+)$/.exec(entry)
    if (match && (!versions.has(match[1]) || compareVersions(match[2], versions.get(match[1])) > 0)) {
      versions.set(match[1], match[2])
    }
  }
  const releases = [...versions].sort(([a], [b]) => a.localeCompare(b))
  const body = releases.map(
    ([grant, version]) =>
      `  - name: ${grant}\n    version: ${version}\n    notes: Local development\n    environments:\n      - name: local\n        status: active\n`
  )
  await writeFile(join(directory, 'release.yml'), 'releases:\n' + body.join(''))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === '--schemas') {
    await prepareAcceptanceSchemas()
  } else {
    const bundles = await prepareExampleGrants({ target: process.argv[2] ? resolve(process.argv[2]) : undefined })
    for (const { grant, version } of bundles) {
      console.log(`Prepared ${grant}@${version} from checked-in example configs`)
    }
  }
}

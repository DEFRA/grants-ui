#!/usr/bin/env node
// Checks whether the upstream packages that currently block certain major-version
// bumps have caught up. Each entry mirrors an `ignore` rule in .github/dependabot.yml.
// When an upstream constraint starts allowing the target major, that bump is
// "unblockable" — remove the matching dependabot ignore rule.
//
// Run: `node scripts/check-blocked-deps.mjs` (or `npm run deps:check-blocked`).
// Exits 0 when everything is still blocked, 10 when one or more are unblockable.
// The scheduled workflow (.github/workflows/check-blocked-deps.yml) uses the exit
// code + stdout to decide whether to open a tracking issue.

import { execFileSync } from 'node:child_process'
import semver from 'semver'

/**
 * Each blocked major bump and the upstream constraint that gates it.
 * `field` is the dot-path into the upstream package's manifest to read its range from.
 * @type {Array<{ name: string, target: string, upstream: string, field: string }>}
 */
const BLOCKED = [
  { name: 'eslint', target: '10.0.0', upstream: 'neostandard', field: 'peerDependencies.eslint' },
  { name: 'joi', target: '18.0.0', upstream: '@defra/forms-engine-plugin', field: 'dependencies.joi' },
  {
    name: 'govuk-frontend',
    target: '6.0.0',
    upstream: '@defra/forms-engine-plugin',
    field: 'dependencies.govuk-frontend'
  }
]

/** Read `field` from the latest published manifest of `pkg` via `npm view`. */
function viewField(pkg, field) {
  const raw = execFileSync('npm', ['view', pkg, field], { encoding: 'utf8' }).trim()
  return raw || null
}

const print = (line = '') => process.stdout.write(`${line}\n`)
const printErr = (line = '') => process.stderr.write(`${line}\n`)

const unblockable = []

for (const dep of BLOCKED) {
  let range
  try {
    range = viewField(dep.upstream, dep.field)
  } catch (err) {
    printErr(`! ${dep.name}: failed to read ${dep.upstream} ${dep.field} — ${err.message}`)
    continue
  }

  if (!range) {
    printErr(`! ${dep.name}: ${dep.upstream} no longer declares ${dep.field} — review manually`)
    continue
  }

  const ready = semver.satisfies(dep.target, range, { includePrerelease: false })
  if (ready) {
    unblockable.push({ ...dep, range })
    print(
      `${dep.name} ${dep.target}: UNBLOCKABLE — ${dep.upstream} now allows "${range}". Remove its dependabot ignore rule.`
    )
  } else {
    print(`${dep.name} ${dep.target}: still blocked — ${dep.upstream} ${dep.field} = "${range}".`)
  }
}

if (unblockable.length > 0) {
  // Machine-readable line for the workflow to parse into an issue body.
  print(`\nUNBLOCKABLE=${unblockable.map((d) => d.name).join(',')}`)
  process.exit(10)
}

print('\nAll tracked majors are still blocked upstream — nothing to do.')

#!/usr/bin/env node
// Removes the matching `ignore` rule(s) from .github/dependabot.yml for the given
// dependency names, along with the explanatory comment lines that sit directly
// above each rule. Used by .github/workflows/check-blocked-deps.yml to open a PR
// once an upstream blocker lifts (detected by scripts/check-blocked-deps.mjs).
//
// Usage: node scripts/remove-dependabot-ignore.mjs <dependency-name>...
// Rewrites the file in place. Names with no matching rule are skipped with a
// warning (so re-runs are harmless); the caller decides whether the resulting
// diff is empty.

import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const CONFIG_PATH = '.github/dependabot.yml'

const print = (line = '') => process.stdout.write(`${line}\n`)
const printErr = (line = '') => process.stderr.write(`${line}\n`)

const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
const indentOf = (line) => line.length - line.trimStart().length

/**
 * Removes the `ignore` rule(s) for the given dependency names from dependabot
 * YAML content, including the contiguous comment block directly above each rule.
 * Pure: takes the file contents as a string and returns the rewritten string
 * plus what was removed/missed. Names with no matching rule are reported in
 * `notFound` rather than throwing.
 *
 * @param {string} content - The dependabot.yml file contents.
 * @param {string[]} names - Dependency names whose ignore rules to remove.
 * @returns {{ content: string, removed: Array<{ name: string, lines: string[] }>, notFound: string[] }}
 */
export function removeIgnoreRules(content, names) {
  const lines = content.split('\n')
  const removed = []
  const notFound = []

  for (const name of names) {
    const matcher = new RegExp(String.raw`^\s*- dependency-name: ["']?${escapeRegExp(name)}["']?\s*$`)
    const idx = lines.findIndex((line) => matcher.test(line))
    if (idx === -1) {
      notFound.push(name)
      continue
    }

    const markerIndent = indentOf(lines[idx])
    let end = idx + 1
    while (end < lines.length && lines[end].trim() !== '' && indentOf(lines[end]) > markerIndent) {
      end++
    }

    // Extend up over the contiguous comment block describing this rule.
    let start = idx
    while (start - 1 >= 0 && lines[start - 1].trim().startsWith('#')) {
      start--
    }

    removed.push({ name, lines: lines.splice(start, end - start) })
  }

  return { content: lines.join('\n'), removed, notFound }
}

function main() {
  const names = process.argv.slice(2)
  if (names.length === 0) {
    printErr('Usage: node scripts/remove-dependabot-ignore.mjs <dependency-name>...')
    process.exit(1)
  }

  const { content, removed, notFound } = removeIgnoreRules(readFileSync(CONFIG_PATH, 'utf8'), names)

  for (const { name, lines } of removed) {
    print(`Removed ignore rule for "${name}":`)
    print(lines.map((line) => `  ${line}`).join('\n'))
  }
  for (const name of notFound) {
    printErr(`! no ignore rule found for "${name}" — skipping`)
  }

  writeFileSync(CONFIG_PATH, content)
}

// Run the CLI only when executed directly, not when imported by a test.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}

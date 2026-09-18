/* eslint-disable curly */

import { loadState, saveInspectorSelection } from './cli-state.js'
import { rcompare, valid } from 'semver'
import { ANSI } from './constants.js'
import { outputLines, viewText } from './output.js'
import { fetchState, fetchStateCatalog } from './state.js'
import { radioMenu, showBusyMenu } from './tui.js'

/** Field paths use JSON Pointer escaping, so punctuation in keys stays unambiguous. */
export function stateChanges(before, after, path = '') {
  if (JSON.stringify(before) === JSON.stringify(after)) return []
  if (
    before &&
    after &&
    typeof before === 'object' &&
    typeof after === 'object' &&
    Array.isArray(before) === Array.isArray(after)
  ) {
    return [...new Set([...Object.keys(before), ...Object.keys(after)])]
      .sort()
      .flatMap((key) =>
        stateChanges(before[key], after[key], `${path}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`)
      )
  }
  const changes = []
  if (before !== undefined) changes.push(`- ${path}: ${JSON.stringify(before)}`)
  if (after !== undefined) changes.push(`+ ${path}: ${JSON.stringify(after)}`)
  return changes
}

export function stateView(document, previous) {
  const lines = [`Application status: ${document?.state?.applicationStatus || 'Pre-submission'}`, '']
  const highlightLines = []
  if (previous !== undefined) {
    const changes = stateChanges(previous, document)
    lines.push(
      changes.length
        ? 'Changes since previous successful fetch (- before, + after):'
        : 'No changes since previous successful fetch.'
    )
    for (const change of changes) {
      highlightLines.push(lines.length)
      lines.push(change)
    }
    lines.push('')
  }
  if (!document)
    lines.push('No saved state for this version. It may have been removed; refresh or return to the version list.')
  lines.push('Current JSON:')
  const jsonStartLine = lines.length
  lines.push(JSON.stringify(document, null, 2))
  return { text: lines.join('\n'), highlightLines, summaryLines: [0], jsonStartLine }
}

/** Keep the last successful snapshot on errors, including when a later retry succeeds. */
export function createStateRefresh(selection, fetch = fetchState) {
  let previous
  /** @type {import('./output.js').TextContent} */
  let current = { text: 'No state loaded yet.', highlightLines: [] }
  return async (signal) => {
    try {
      const documents = await fetch(selection, signal)
      // Exact version queries normally return one document; never display multiple.
      const document = documents[0] ?? null
      current = stateView(document, previous)
      previous = document
      return current
    } catch (error) {
      const detail = outputLines(error.message).join(' ')
      const notice = `Could not refresh: ${detail}\nPress r to retry or Esc to return.\n${previous === undefined ? 'No successful fetch yet.' : 'Showing the last successful snapshot (stale).'}\n\n`
      return {
        text: notice + current.text,
        highlightLines: current.highlightLines?.map((line) => line + 4),
        summaryLines: current.summaryLines?.map((line) => line + 4),
        jsonStartLine: current.jsonStartLine === undefined ? undefined : current.jsonStartLine + 4
      }
    }
  }
}

/** Distinct choices scoped to the selected grant and business. */
export function catalogChoices(catalog, grantCode, sbi) {
  const rows = catalog.filter(
    (row) =>
      typeof row.grantCode === 'string' &&
      row.grantCode &&
      typeof row.sbi === 'string' &&
      row.sbi &&
      typeof row.grantVersion === 'string' &&
      row.grantVersion
  )
  if (grantCode === undefined) return [...new Set(rows.map((row) => row.grantCode))].sort()
  const matching = rows.filter((row) => row.grantCode === grantCode)
  if (sbi === undefined) return [...new Set(matching.map((row) => row.sbi))].sort()
  return [...new Set(matching.filter((row) => row.sbi === sbi).map((row) => row.grantVersion))].sort((a, b) =>
    valid(a) && valid(b) ? rcompare(a, b) : b.localeCompare(a, undefined, { numeric: true })
  )
}

async function loadCatalog() {
  while (true) {
    const controller = new AbortController()
    const stop = showBusyMenu(
      [],
      'Loading grants and SBIs from MongoDB',
      () => controller.abort(),
      ANSI,
      'Application state'
    )
    let errorMessage = ''
    try {
      return await fetchStateCatalog(controller.signal)
    } catch (error) {
      if (controller.signal.aborted) return null
      errorMessage = outputLines(error.message).join(' ')
    } finally {
      stop()
    }
    await viewText({ title: 'Could not load application state', subtitle: 'MongoDB', text: errorMessage })
    if (
      (await radioMenu(
        [{ key: 'retry', label: 'retry', description: 'Load grants and SBIs again' }],
        'Application state',
        { hint: 'enter → retry · esc → Tools' }
      )) === '__quit__'
    )
      return null
  }
}

export async function inspectState(dryRun = false) {
  if (dryRun) {
    await viewText({
      title: 'Application state · read-only',
      subtitle: 'Dry run',
      text: 'Would list grants, SBIs and versions from MongoDB, then query one selected version.'
    })
    return
  }
  const catalog = await loadCatalog()
  if (!catalog) return
  const grants = catalogChoices(catalog, undefined, undefined)
  if (!grants.length) {
    await viewText({
      title: 'Application state',
      subtitle: 'MongoDB',
      text: 'No saved grant applications with a grant code, SBI and version were found. Start a grant journey, then reopen the inspector.'
    })
    return
  }
  const saved = loadState()?.stateInspector ?? {}
  const menu = (values, title, initialKey = undefined, versions = false) =>
    radioMenu(
      values.map((value, index) => ({
        key: value,
        label: outputLines(value).join(' '),
        description: versions && index === 0 ? 'Latest' : ''
      })),
      title,
      { hint: '↑ ↓ navigate · enter → select · esc → back', initialKey }
    )
  while (true) {
    const grantCode = await menu(grants, 'Select a grant', saved.grantCode)
    if (grantCode === '__quit__') return
    while (true) {
      const sbi = await menu(
        catalogChoices(catalog, grantCode, undefined),
        `Select an SBI · ${grantCode}`,
        saved.grantCode === grantCode ? saved.sbi : undefined
      )
      if (sbi === '__quit__') break
      while (true) {
        const grantVersion = await menu(
          catalogChoices(catalog, grantCode, sbi),
          `Select a version · ${grantCode} · ${sbi}`,
          undefined,
          true
        )
        if (grantVersion === '__quit__') break
        const selection = { grantCode, sbi, grantVersion }
        saveInspectorSelection(selection)
        Object.assign(saved, selection)
        await viewText({
          title: 'Application state · read-only',
          subtitle: `Grant ${grantCode} · SBI ${sbi} · Version ${grantVersion}`,
          text: 'Fetching state…',
          refresh: createStateRefresh(selection)
        })
      }
    }
  }
}

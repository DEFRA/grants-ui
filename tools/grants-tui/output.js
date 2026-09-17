/* eslint-disable curly, no-control-regex */

import { readFile } from 'node:fs/promises'
import * as readline from 'node:readline'
import { stripVTControlCharacters } from 'node:util'
import { pathToFileURL } from 'node:url'
import { ANSI, BOLD, CLEAR_SCREEN, DIM, HIDE_CURSOR, RESET_COLOR, SHOW_CURSOR, YELLOW } from './constants.js'
import { highlightJsonLine } from './json-highlight.js'

/** Logs are data: never replay terminal control sequences emitted by a command. */
export function outputLines(text) {
  return stripVTControlCharacters(text)
    .replace(/\r\n?/g, '\n')
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '')
    .split('\n')
}

/**
 * Searchable output viewer; q/escape returns to the menu, with no external pager dependency.
 * @returns {Promise<void>}
 */
export async function viewOutput(run) {
  let text
  try {
    text = await readFile(run.logPath, 'utf8')
  } catch (error) {
    text = `Could not read output: ${error.message}`
  }
  return viewText({
    title: `${run.label} — exit ${run.code}`,
    subtitle: run.logPath,
    text,
    link: pathToFileURL(run.logPath).href,
    startAtEnd: true
  })
}

/**
 * Shared searchable viewer for logs and in-memory application state.
 * @typedef {{ text: string, highlightLines?: number[], summaryLines?: number[], jsonStartLine?: number }} TextContent
 */

/**
 * @param {{ title: string, subtitle: string, text: string, link?: string, startAtEnd?: boolean,
 * refresh?: (signal: AbortSignal) => Promise<TextContent> }} options
 */
export function viewText({ title, subtitle, text, link, startAtEnd = false, refresh }) {
  let lines = outputLines(text)
  let highlighted = new Set()
  let summary = new Set()
  let jsonStart = Infinity
  return new Promise((resolve) => {
    const controller = new AbortController()
    let closed = false
    let refreshing = false
    const pageSize = () => Math.max(1, (process.stdout.rows || 24) - 6)
    let top = startAtEnd ? Math.max(0, lines.length - pageSize()) : 0
    let left = 0
    let query = ''
    let matchIndex = null
    let editingSearch = false
    let searchMessage = ''
    function draw() {
      const width = Math.max(1, (process.stdout.columns || 100) - 2)
      top = Math.max(0, Math.min(top, lines.length - pageSize()))
      const hint = refresh
        ? 'r refresh · / search · n next · q/esc back · arrows/pgup/pgdn/home/end'
        : '↑ ↓ / pgup pgdn scroll · ← → pan · home/end · / search · n next · q/esc back'
      const heading = [
        `${BOLD}${outputLines(title).join(' ').slice(0, width)}${RESET_COLOR}`,
        link
          ? `\x1b]8;;${link}\x1b\\${outputLines(subtitle).join(' ').slice(-width)}\x1b]8;;\x1b\\`
          : outputLines(subtitle).join(' ').slice(0, width),
        `${DIM}${hint.slice(0, width)}${RESET_COLOR}`,
        ''
      ]
      const content = lines.slice(top, top + pageSize()).map((line, index) => {
        const text = line.replaceAll('\t', '  ')
        const visible = text.slice(left, left + width)
        const lineIndex = top + index
        if (ANSI && highlighted.has(lineIndex)) return `${YELLOW}${visible}${RESET_COLOR}`
        if (ANSI && summary.has(lineIndex)) {
          const boundary = text.indexOf(': ') + 2
          const label = text.slice(0, boundary).slice(left, left + width)
          const value = text.slice(Math.max(left, boundary), Math.max(left + width, boundary))
          return `\x1b[97m${label}${RESET_COLOR}${YELLOW}${value}${RESET_COLOR}`
        }
        return lineIndex >= jsonStart ? highlightJsonLine(text, left, width) : visible
      })
      const footer = editingSearch
        ? `/${query}`
        : `${top + 1}–${Math.min(lines.length, top + pageSize())} / ${lines.length}  ${refreshing ? 'Fetching state…' : searchMessage}`
      process.stdout.write(HIDE_CURSOR + CLEAR_SCREEN + [...heading, ...content, '', footer.slice(0, width)].join('\n'))
    }
    async function reload() {
      if (!refresh || refreshing || closed) return
      refreshing = true
      draw()
      try {
        const result = await refresh(controller.signal)
        if (closed) return
        lines = outputLines(result.text)
        highlighted = new Set(result.highlightLines ?? [])
        summary = new Set(result.summaryLines ?? [])
        jsonStart = result.jsonStartLine ?? Infinity
        matchIndex = null
        searchMessage = ''
      } catch (error) {
        if (!closed) searchMessage = outputLines(`Refresh failed: ${error.message}`).join(' ')
      } finally {
        refreshing = false
        if (!closed) draw()
      }
    }
    function search() {
      if (!query) return
      const needle = query.toLowerCase()
      for (let step = 1; step <= lines.length; step++) {
        const index = ((matchIndex ?? top) + step) % lines.length
        if (lines[index].toLowerCase().includes(needle)) {
          top = index
          matchIndex = index
          searchMessage = `/${query}`
          return
        }
      }
      searchMessage = `No matches: ${query}`
    }
    function cleanup() {
      closed = true
      controller.abort()
      process.stdin.removeListener('keypress', onKey)
      process.stdout.removeListener('resize', draw)
      if (process.stdin.isTTY) process.stdin.setRawMode(false)
      process.stdout.write(SHOW_CURSOR)
      resolve(undefined)
    }
    function onKey(text, key) {
      if (!key) return
      if (key.ctrl && key.name === 'c') {
        cleanup()
        return
      }
      if (editingSearch) {
        if (key.name === 'escape') editingSearch = false
        else if (key.name === 'return' || key.name === 'enter') {
          editingSearch = false
          search()
        } else if (key.name === 'backspace') query = query.slice(0, -1)
        else if (text && !key.ctrl && !key.meta) query += text.replace(/[\x00-\x1f\x7f]/g, '')
      } else if (key.name === 'escape' || key.name === 'q') {
        cleanup()
        return
      } else if (key.name === 'r' && refresh) reload()
      else if (key.name === 'up') top--
      else if (key.name === 'down') top++
      else if (key.name === 'pageup') top -= pageSize()
      else if (key.name === 'pagedown' || key.name === 'space') top += pageSize()
      else if (key.name === 'home') top = 0
      else if (key.name === 'end') top = lines.length - pageSize()
      else if (key.name === 'left') left = Math.max(0, left - 20)
      else if (key.name === 'right') left += 20
      else if (text === '/') {
        editingSearch = true
        query = ''
        matchIndex = null
      } else if (key.name === 'n') search()
      draw()
    }
    readline.emitKeypressEvents(process.stdin)
    if (process.stdin.isTTY) process.stdin.setRawMode(true)
    process.stdin.on('keypress', onKey)
    process.stdout.on('resize', draw)
    draw()
    if (refresh) reload()
  })
}

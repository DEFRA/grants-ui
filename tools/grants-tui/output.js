/* eslint-disable curly, no-control-regex */

import { readFile } from 'node:fs/promises'
import * as readline from 'node:readline'
import { stripVTControlCharacters } from 'node:util'
import { pathToFileURL } from 'node:url'
import { BOLD, CLEAR_SCREEN, DIM, HIDE_CURSOR, RESET_COLOR, SHOW_CURSOR } from './constants.js'

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
  let lines
  try {
    lines = outputLines(await readFile(run.logPath, 'utf8'))
  } catch (error) {
    lines = [`Could not read output: ${error.message}`]
  }
  return new Promise((resolve) => {
    const pageSize = () => Math.max(1, (process.stdout.rows || 24) - 6)
    let top = Math.max(0, lines.length - pageSize())
    let left = 0
    let query = ''
    let matchIndex = null
    let editingSearch = false
    let searchMessage = ''
    function draw() {
      const width = Math.max(1, (process.stdout.columns || 100) - 2)
      top = Math.max(0, Math.min(top, lines.length - pageSize()))
      const heading = [
        `${BOLD}${`${run.label} — exit ${run.code}`.slice(0, width)}${RESET_COLOR}`,
        `\x1b]8;;${pathToFileURL(run.logPath).href}\x1b\\${run.logPath.slice(-width)}\x1b]8;;\x1b\\`,
        `${DIM}${'↑ ↓ / pgup pgdn scroll · ← → pan · home/end · / search · n next · q/esc back'.slice(0, width)}${RESET_COLOR}`,
        ''
      ]
      const content = lines
        .slice(top, top + pageSize())
        .map((line) => line.replaceAll('\t', '  ').slice(left, left + width))
      const footer = editingSearch
        ? `/${query}`
        : `${top + 1}–${Math.min(lines.length, top + pageSize())} / ${lines.length}  ${searchMessage}`
      process.stdout.write(HIDE_CURSOR + CLEAR_SCREEN + [...heading, ...content, '', footer.slice(0, width)].join('\n'))
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
      process.stdin.removeListener('keypress', onKey)
      process.stdout.removeListener('resize', draw)
      if (process.stdin.isTTY) process.stdin.setRawMode(false)
      process.stdout.write(SHOW_CURSOR)
      resolve()
    }
    function onKey(text, key) {
      if (!key) return
      if (editingSearch) {
        if (key.name === 'escape') editingSearch = false
        else if (key.name === 'return' || key.name === 'enter') {
          editingSearch = false
          search()
        } else if (key.name === 'backspace') query = query.slice(0, -1)
        else if (text && !key.ctrl && !key.meta) query += text.replace(/[\x00-\x1f\x7f]/g, '')
      } else if (key.name === 'escape' || key.name === 'q' || (key.ctrl && key.name === 'c')) {
        cleanup()
        return
      } else if (key.name === 'up') top--
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
  })
}

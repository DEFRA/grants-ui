import { ANSI } from './constants.js'

// IntelliJ Darcula-style palette, independent of the terminal's ANSI theme.
const COLOURS = {
  key: '\x1b[38;2;152;118;170m',
  string: '\x1b[38;2;106;135;89m',
  number: '\x1b[38;2;104;151;187m',
  literal: '\x1b[38;2;204;120;50m',
  punctuation: '\x1b[38;2;169;183;198m'
}

/** Tokenise before clipping so horizontal scrolling preserves colours within strings. */
export function highlightJsonLine(line, left, width, enabled = ANSI) {
  if (!enabled) {
    return line.slice(left, left + width)
  }
  const pattern =
    /"(?:\\.|[^"\\])*"(?=\s*:)|"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\b(?:true|false|null)\b|[{}[\],:]/g
  let result = ''
  let end = 0
  function append(text, start, colour = '') {
    const visible = text.slice(Math.max(0, left - start), Math.max(0, Math.min(text.length, left + width - start)))
    if (visible) {
      result += colour ? `${colour}${visible}\x1b[0m` : visible
    }
  }
  for (const match of line.matchAll(pattern)) {
    append(line.slice(end, match.index), end)
    const token = match[0]
    const type = token.startsWith('"')
      ? /^\s*:/.test(line.slice(match.index + token.length))
        ? 'key'
        : 'string'
      : /^-?\d/.test(token)
        ? 'number'
        : /^(true|false|null)$/.test(token)
          ? 'literal'
          : 'punctuation'
    append(token, match.index, COLOURS[type])
    end = match.index + token.length
  }
  append(line.slice(end), end)
  return result
}

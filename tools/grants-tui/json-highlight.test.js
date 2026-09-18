// @vitest-environment node
import { expect, test } from 'vitest'
import { stripVTControlCharacters } from 'node:util'
import { highlightJsonLine } from './json-highlight.js'

test('colours JSON keys, strings, numbers, booleans, null and punctuation without changing text', () => {
  const text = '{"text": "a \\"quoted\\" string", "number": -1.2e+3, "bool": true, "nothing": null}'
  const result = highlightJsonLine(text, 0, 500, true)
  expect(result).toContain('\x1b[38;2;152;118;170m"text"\x1b[0m')
  expect(result).toContain('\x1b[38;2;106;135;89m"a \\"quoted\\" string"\x1b[0m')
  expect(result).toContain('\x1b[38;2;104;151;187m-1.2e+3\x1b[0m')
  expect(result).toContain('\x1b[38;2;204;120;50mtrue\x1b[0m')
  expect(result).toContain('\x1b[38;2;204;120;50mnull\x1b[0m')
  expect(stripVTControlCharacters(result)).toBe(text)
})

test('horizontal clipping preserves string colour even when the opening quote is off screen', () => {
  const text = '  "answer": "a long string with true and 123 inside"'
  const result = highlightJsonLine(text, 20, 15, true)
  expect(stripVTControlCharacters(result)).toBe(text.slice(20, 35))
  expect(result.startsWith('\x1b[38;2;106;135;89m')).toBe(true)
  expect(highlightJsonLine(text, 200, 10, true)).toBe('')
  expect(highlightJsonLine(text, 0, 500, false)).toBe(text)
})

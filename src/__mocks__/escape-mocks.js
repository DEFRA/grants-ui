import { expect } from 'vitest'
import { escapeHtml } from '~/src/server/common/utils/escape-html.js'

/**
 * A value containing every character `escapeHtml` rewrites, for feeding into
 * code that writes untrusted values into raw HTML.
 */
export const HTML_INJECTION = `<script>"'&</script>`

// Importing this module registers `expect(html).toBeEscaped(value?)`, which
// passes when `value` (default HTML_INJECTION) appears in `html` escaped and never raw.
expect.extend({
  toBeEscaped(html, value = HTML_INJECTION) {
    const escaped = escapeHtml(value)
    const pass = !html.includes(value) && html.includes(escaped)
    return {
      pass,
      message: () =>
        pass
          ? `expected ${this.utils.printReceived(html)} not to contain ${this.utils.printExpected(value)} escaped`
          : `expected ${this.utils.printReceived(html)} to contain ${this.utils.printExpected(escaped)} and not the raw ${this.utils.printExpected(value)}`
    }
  }
})

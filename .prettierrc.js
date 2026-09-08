/**
 * @type {Options}
 */
export default {
  tabWidth: 2,
  semi: false,
  singleQuote: true,
  trailingComma: 'none',
  printWidth: 120,
  plugins: ['prettier-plugin-jinja-template'],
  overrides: [
    { files: ['*.html', '*.njk'], options: { parser: 'jinja-template' } },
    { files: ['*.md'], options: { embeddedLanguageFormatting: 'off' } }
  ]
}

/**
 * @import { Options } from 'prettier'
 */

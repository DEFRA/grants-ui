import { getAllForms } from '../utils/index.js'
import { errorRoutes } from '../index.js'

/**
 * Get example forms for demo links
 * @param {Array<string>} [slugs=['example-grant-with-auth', 'adding-value', 'flying-pigs']] - Form slugs to include
 * @param {number} [limit=3] - Maximum number of forms to return
 * @returns {Array} Array of example form objects
 */
export function getExampleForms(slugs = ['example-grant-with-auth', 'adding-value', 'flying-pigs'], limit = 3) {
  const allForms = getAllForms()
  return allForms.filter((f) => slugs.includes(f.slug)).slice(0, limit)
}

/**
 * Build tools configuration for the dev home page
 * @param {Array} exampleForms - Array of example forms
 * @returns {Array} Array of tool configurations
 */
export function buildToolsConfig(exampleForms) {
  return [
    {
      name: 'Demo Confirmation Pages',
      description: 'Test the config-driven confirmation page with different form configurations',
      pattern: '/dev/demo-confirmation/{slug}',
      examples: exampleForms.map((form) => ({
        name: form.title,
        path: `/dev/demo-confirmation/${form.slug}`,
        slug: form.slug
      }))
    },
    {
      name: 'Test Error Pages',
      description: 'Trigger HTTP error responses to test error page templates',
      pattern: '/dev/test-{code}',
      examples: errorRoutes.map(({ code, message }) => ({
        name: `${code} - ${message}`,
        path: `/dev/test-${code}`,
        slug: `test-${code}`
      }))
    }
  ]
}

/**
 * Generate CSS styles for the dev home page
 * @returns {string} CSS styles as string
 */
export function generatePageStyles() {
  return `
    body { font-family: system-ui, sans-serif; margin: 40px; }
    .warning { background: #ffe6cc; padding: 15px; border-left: 4px solid #f47738; margin-bottom: 30px; }
    .tool { background: #f8f8f8; padding: 15px; margin-bottom: 15px; border-radius: 4px; }
    .tool h3 { margin-top: 0; }
    .tool a { color: #005ea5; text-decoration: none; }
    .tool a:hover { text-decoration: underline; }
    .env-info { background: #e6f3ff; padding: 10px; border-radius: 4px; font-size: 0.9em; }
  `
}

/**
 * Generate environment info section HTML
 * @returns {string} Environment info HTML
 */
export function generateEnvironmentInfo() {
  return `
    <div class="env-info">
      <strong>Environment:</strong> ${process.env.NODE_ENV || 'unknown'}<br>
      <strong>isLocal:</strong> ${process.env.ENVIRONMENT || 'unknown'}<br>
      <strong>Access:</strong> Development tools enabled
    </div>
  `
}

/**
 * Generate pattern HTML if pattern exists
 * @param {string|undefined} pattern - URL pattern for the tool
 * @returns {string} Pattern HTML or empty string
 */
function generatePatternHtml(pattern) {
  if (!pattern) {
    return ''
  }
  return `<p style="margin-top: 10px; font-size: 0.9em; color: #666;">
            Pattern: <code>${pattern}</code>
          </p>`
}

/**
 * Generate examples HTML if examples exist
 * @param {Array|undefined} examples - Array of example objects
 * @param {string|undefined} pattern - URL pattern for the tool
 * @returns {string} Examples HTML or empty string
 */
function generateExamplesHtml(examples, pattern) {
  if (!examples) {
    return ''
  }
  const exampleItems = examples
    .map(
      (example) => `
              <li style="margin-bottom: 5px;">
                <a href="${example.path}">${example.name}</a>
                <code style="background: #f0f0f0; padding: 2px 4px; font-size: 0.9em; margin-left: 8px;">${example.slug}</code>
              </li>
            `
    )
    .join('')

  return `
        <div style="margin-top: 15px;">
          <strong>Example forms:</strong>
          <ul style="margin-top: 8px;">
            ${exampleItems}
          </ul>
          ${generatePatternHtml(pattern)}
        </div>
      `
}

/**
 * Generate tools section HTML
 * @param {Array} tools - Array of tool configurations
 * @returns {string} Tools section HTML
 */
export function generateToolsSection(tools) {
  return tools
    .map(
      (tool) => `
    <div class="tool">
      <h3>${tool.name}</h3>
      <p>${tool.description}</p>
      ${generateExamplesHtml(tool.examples, tool.pattern)}
    </div>
  `
    )
    .join('')
}

/**
 * Generate complete HTML page for dev tools home
 * @param {Array} tools - Array of tool configurations
 * @returns {string} Complete HTML page
 */
export function generateDevHomePage(tools) {
  return `<!DOCTYPE html>
<html>
  <head>
    <title>Development Tools</title>
    <style>${generatePageStyles()}</style>
  </head>
  <body>
    <div class="warning">
      <strong>⚠️ Development Mode Only</strong><br>
      These tools are only available when NODE_ENV=development, and ENVIRONMENT=local.<br>
      They will not be accessible in production environments.
    </div>

    <h1>Development Tools</h1>

    ${generateEnvironmentInfo()}

    <h2>Available Tools</h2>
    ${generateToolsSection(tools)}

    <hr style="margin: 40px 0;">
    <p><em>To add more development tools, edit src/server/dev-tools/</em></p>
  </body>
</html>`
}

/**
 * Main dev home page handler
 * @param {object} _request - Hapi request object
 * @param {object} h - Hapi response toolkit
 * @returns {object} Hapi response
 */
export function devHomeHandler(_request, h) {
  const exampleForms = getExampleForms()
  const tools = buildToolsConfig(exampleForms)
  const htmlContent = generateDevHomePage(tools)

  return h.response(htmlContent).type('text/html')
}

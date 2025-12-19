import { getAllForms } from '../utils/index.js'

/**
 * Get forms that have confirmationContent configured
 * @returns {Array} Array of form objects with confirmationContent
 */
export function getFormsWithConfirmationContent() {
  const allForms = getAllForms()
  return allForms.filter((form) => form.metadata?.confirmationContent)
}

/**
 * Get forms that have detailsPage configured
 * @returns {Array} Array of form objects with detailsPage
 */
export function getFormsWithDetailsPage() {
  const allForms = getAllForms()
  return allForms.filter((form) => form.metadata?.detailsPage)
}

/**
 * Build tools configuration for the dev home page
 * @param {object} options - Configuration options
 * @param {Array} options.confirmationForms - Forms with confirmationContent configured
 * @param {Array} options.detailsForms - Forms with detailsPage configured
 * @returns {Array} Array of tool configurations
 */
export function buildToolsConfig({ confirmationForms, detailsForms }) {
  return [
    {
      name: 'Demo Confirmation Pages',
      description: 'Test the config-driven confirmation page with different form configurations',
      pattern: '/dev/demo-confirmation/{slug}',
      examples: confirmationForms.map((form) => ({
        name: form.title,
        path: `/dev/demo-confirmation/${form.slug}`,
        slug: form.slug
      }))
    },
    {
      name: 'Demo Details Pages',
      description: 'Test the config-driven details page (check-details) with different form configurations',
      pattern: '/dev/demo-details/{slug}',
      examples: detailsForms.map((form) => ({
        name: form.title,
        path: `/dev/demo-details/${form.slug}`,
        slug: form.slug
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
      ${
        tool.examples
          ? `
        <div style="margin-top: 15px;">
          <strong>Example forms:</strong>
          <ul style="margin-top: 8px;">
            ${tool.examples
              .map(
                (example) => `
              <li style="margin-bottom: 5px;">
                <a href="${example.path}">${example.name}</a>
                <code style="background: #f0f0f0; padding: 2px 4px; font-size: 0.9em; margin-left: 8px;">${example.slug}</code>
              </li>
            `
              )
              .join('')}
          </ul>
          <p style="margin-top: 10px; font-size: 0.9em; color: #666;">
            Pattern: <code>${tool.pattern}</code>
          </p>
        </div>
      `
          : ''
      }
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
  const confirmationForms = getFormsWithConfirmationContent()
  const detailsForms = getFormsWithDetailsPage()
  const tools = buildToolsConfig({ confirmationForms, detailsForms })
  const htmlContent = generateDevHomePage(tools)

  return h.response(htmlContent).type('text/html')
}

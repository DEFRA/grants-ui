import { escapeHtml } from '~/src/server/common/utils/escape-html.js'

const HTTP_STATUS = {
  NOT_FOUND: 404
}

/**
 * Generate error response for invalid form slug
 * @param {string} slug - Invalid slug
 * @param {object} h - Hapi response toolkit
 * @param {object} [options] - Optional configuration
 * @param {string} [options.backLink='/dev'] - Back navigation link
 * @param {string} [options.title='Invalid Form Slug'] - Page title
 * @param {string} [options.errorMessage='Local Mode Error'] - Error message prefix
 * @returns {Promise<object>} Hapi response
 */
export async function generateFormNotFoundResponse(slug, h, options = {}) {
  const { backLink = '/dev', title = 'Invalid Form Slug', errorMessage = 'Local Mode Error' } = options

  return h
    .response(
      `
    <html>
      <head><title>${escapeHtml(title)}</title></head>
      <body style="font-family: system-ui, sans-serif; margin: 40px;">
        <div style="background: #ffe6cc; padding: 15px; border-left: 4px solid #f47738; margin-bottom: 30px;">
          <strong>⚠️ ${escapeHtml(errorMessage)}</strong><br>
          Form slug "${escapeHtml(slug)}" not found in grants-ui-backend.
        </div>
        <p><a href="${escapeHtml(backLink)}">← Back to Dev Tools</a></p>
      </body>
    </html>
  `
    )
    .type('text/html')
    .code(HTTP_STATUS.NOT_FOUND)
}

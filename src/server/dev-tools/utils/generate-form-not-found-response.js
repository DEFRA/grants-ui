import { getFormsCache } from '../../common/forms/services/form.js'

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
 * @returns {object} Hapi response
 */
export function generateFormNotFoundResponse(slug, h, options = {}) {
  const { backLink = '/dev', title = 'Invalid Form Slug', errorMessage = 'Local Mode Error' } = options

  const allForms = getFormsCache()
  const availableSlugs = allForms.map((f) => `• ${f.slug} (${f.title})`).join('\n')

  return h
    .response(
      `
    <html>
      <head><title>${title}</title></head>
      <body style="font-family: system-ui, sans-serif; margin: 40px;">
        <div style="background: #ffe6cc; padding: 15px; border-left: 4px solid #f47738; margin-bottom: 30px;">
          <strong>⚠️ ${errorMessage}</strong><br>
          Form slug "${slug}" not found.
        </div>
        <h1>Available Forms</h1>
        <pre>${availableSlugs}</pre>
        <p><a href="${backLink}">← Back to Dev Tools</a></p>
      </body>
    </html>
  `
    )
    .type('text/html')
    .code(HTTP_STATUS.NOT_FOUND)
}

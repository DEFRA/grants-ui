/**
 * Display all incoming request headers for debugging purposes
 * @param {object} request - Hapi request object
 * @param {object} h - Hapi response toolkit
 * @returns {object} Hapi response
 */
export function headersHandler(request, h) {
  const rows = Object.entries(request.headers)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([name, value]) => `
      <tr>
        <td style="font-family: monospace; font-weight: bold; padding: 6px 12px; white-space: nowrap; vertical-align: top;">${escapeHtml(name)}</td>
        <td style="font-family: monospace; padding: 6px 12px; word-break: break-all;">${escapeHtml(value)}</td>
      </tr>`
    )
    .join('')

  const html = `<!DOCTYPE html>
<html>
  <head>
    <title>Request Headers</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 40px; }
      table { border-collapse: collapse; width: 100%; }
      th { text-align: left; padding: 8px 12px; background: #f0f0f0; border-bottom: 2px solid #ccc; }
      tr:nth-child(even) { background: #fafafa; }
    </style>
  </head>
  <body>
    <h1>Request Headers</h1>
    <table>
      <thead>
        <tr>
          <th>Header</th>
          <th>Value</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  </body>
</html>`

  return h.response(html).type('text/html')
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

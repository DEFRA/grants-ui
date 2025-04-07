export default {
  plugin: {
    name: 'headers',
    register: (server, _options) => {
      server.ext('onPreResponse', (request, h) => {
        const headers = request.response.headers

        headers['X-Content-Type-Options'] = 'nosniff'
        headers['X-Frame-Options'] = 'DENY'
        headers['X-Robots-Tag'] = 'noindex, nofollow'
        headers['X-XSS-Protection'] = '1; mode=block'
        headers['Cross-Origin-Opener-Policy'] = 'same-origin'
        headers['Cross-Origin-Embedder-Policy'] = 'require-corp'
        headers['Cross-Origin-Resource-Policy'] = 'same-site'
        headers['Referrer-Policy'] = 'no-referrer'
        headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains; preload'
        headers['Permissions-Policy'] = 'camera=(), geolocation=(), magnetometer=(), microphone=(), payment=(), usb=()'
        // Disable caching for all routes except the index page and assets
        // This is to prevent browsers from caching sensitive data in the browser history
        // Prevents the back button from displaying sensitive data after the user has signed out
        if (request.path !== '/' && !request.path.startsWith('/assets')) {
          // Cache-Control must be lower case to avoid conflicts with Hapi's built-in header handling
          headers['cache-control'] = 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0'
          headers.Pragma = 'no-cache'
          headers.Expires = '0'
        }

        return h.continue
      })
    }
  }
}

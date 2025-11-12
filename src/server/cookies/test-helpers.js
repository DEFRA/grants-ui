import { JSDOM, VirtualConsole } from 'jsdom'

/**
 * Sets up a JSDOM instance with the provided HTML and configures the global document and window objects.
 * Suppresses JSDOM navigation errors to prevent test failures when testing navigation behaviour.
 *
 * @param {string} html - The HTML content to load into the JSDOM instance
 * @param {string} [url='http://localhost'] - The URL to use for the JSDOM instance
 * @returns {{dom: JSDOM, document: Document, window: Window}} The JSDOM instance and references to document and window
 */
export const setupDOM = (html, url = 'http://localhost') => {
  const virtualConsole = new VirtualConsole()
  virtualConsole.on('jsdomError', () => {})

  const dom = new JSDOM(html, {
    url,
    pretendToBeVisual: true,
    virtualConsole
  })

  globalThis.document = dom.window.document
  globalThis.window = dom.window

  return { dom, document: dom.window.document, window: dom.window }
}

/**
 * Creates a minimal empty HTML page for testing early exit conditions.
 *
 * @returns {string} HTML string representing an empty page
 */
export const createEmptyPage = () => `
  <!DOCTYPE html>
  <html>
    <head></head>
    <body>
      <p>No content here</p>
    </body>
  </html>
`

/**
 * Clicks a button with navigation error handling for test environments.
 * Suppresses navigation errors that occur in JSDOM when testing client-side redirects.
 *
 * @param {HTMLElement} button - The button element to click
 * @param {Window & typeof globalThis} window - The window object for creating events
 */
export const clickWithNavigationHandling = (button, window) => {
  try {
    // @ts-ignore - JSDOM window has Event constructor
    button.dispatchEvent(new window.Event('click', { bubbles: true }))
  } catch {
    // Intentionally ignore navigation errors in test environment
  }
}

/**
 * Gets the current count of script tags in the document head.
 *
 * @param {Document} document - The document object
 * @returns {number} The number of script elements
 */
export const getScriptCount = (document) => document.head.querySelectorAll('script').length

/**
 * Sets up a JSDOM instance with document.readyState='loading' and intercepts
 * DOMContentLoaded to verify and trigger the event listener.
 *
 * @param {string} html - The HTML content
 * @param {Function} importCallback - Async function to import the module under test
 * @returns {Promise<{listenerAdded: boolean, document: Document, window: Window}>}
 */
export const setupLoadingDocument = async (html, importCallback) => {
  const virtualConsole = new VirtualConsole()
  virtualConsole.on('jsdomError', () => {})

  const dom = new JSDOM(html, {
    url: 'http://localhost',
    pretendToBeVisual: true,
    virtualConsole
  })

  Object.defineProperty(dom.window.document, 'readyState', {
    writable: false,
    configurable: true,
    value: 'loading'
  })

  const originalDocument = globalThis.document
  const originalWindow = globalThis.window

  globalThis.document = dom.window.document
  globalThis.window = dom.window

  let listenerAdded = false
  const originalAddEventListener = globalThis.document.addEventListener
  globalThis.document.addEventListener = function (event, handler) {
    if (event === 'DOMContentLoaded') {
      listenerAdded = true
      handler()
    }
    return originalAddEventListener.call(globalThis.document, event, handler)
  }

  await importCallback()

  globalThis.document = originalDocument
  globalThis.window = originalWindow

  return {
    listenerAdded,
    document: dom.window.document,
    window: dom.window
  }
}

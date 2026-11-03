import { CLASS_VISUALLY_HIDDEN } from './config.js'

/**
 * A polite live region inside the map wrapper. Visually hidden by default; pass
 * a class of your own for a message sighted users must see as well.
 * @param {HTMLElement} wrapper
 * @param {{ className?: string }} [options]
 * @returns {{ element: HTMLDivElement, announce: (text: string) => void, clear: () => void }}
 */
export function createAnnouncer(wrapper, { className = CLASS_VISUALLY_HIDDEN } = {}) {
  const element = document.createElement('div')
  element.className = className
  element.setAttribute('role', 'status')
  element.setAttribute('aria-live', 'polite')
  wrapper.appendChild(element)

  return {
    element,
    announce(text) {
      element.textContent = text
    },
    clear() {
      element.textContent = ''
    }
  }
}

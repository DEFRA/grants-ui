import { ComponentsRegistry } from '../../confirmation/services/components.registry.js'

/**
 * @param {string} html
 * @param {string} slug
 */
export function renderConfigurableHtml(html, slug) {
  const processedHtml = ComponentsRegistry.replaceComponents(html)
  return slug ? processedHtml.replaceAll('{{SLUG}}', slug) : processedHtml
}

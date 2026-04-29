/**
 * @type {Object<string, import('./definition.js').LogCodesDefinition>}
 */
export const RESOURCE_NOT_FOUND = {
  FORM_NOT_FOUND: {
    level: 'info',
    messageFunc: (messageOptions) =>
      `Form not found: slug=${messageOptions.slug}, userId=${messageOptions.userId || 'anonymous'}, sbi=${messageOptions.sbi || 'unknown'}, reason=${messageOptions.reason || 'not_found'}, environment=${messageOptions.environment || 'unknown'}, referer=${messageOptions.referer || 'none'}`
  },
  PAGE_NOT_FOUND: {
    level: 'info',
    messageFunc: (messageOptions) =>
      `Page not found: path=${messageOptions.path}, userId=${messageOptions.userId || 'anonymous'}, sbi=${messageOptions.sbi || 'unknown'}, referer=${messageOptions.referer || 'none'}, userAgent=${messageOptions.userAgent || 'unknown'}`
  }
}

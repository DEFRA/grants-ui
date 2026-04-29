/**
 * @type {Object<string, import('./definition.js').LogCodesDefinition>}
 */
export const COOKIES = {
  PAGE_LOAD: {
    level: 'info',
    messageFunc: (messageOptions) =>
      `Cookies page loaded: returnUrl=${messageOptions.returnUrl}, referer=${messageOptions.referer}`
  }
}

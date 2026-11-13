/**
 * The applications selector of a grant allowing multiple applications.
 * @type {Object<string, import('./definition.js').LogCodesDefinition>}
 */
export const APPLICATIONS = {
  RULES_UNAVAILABLE: {
    level: 'warn',
    messageFunc: (details) =>
      `No post-submission rules for a listed application's grant major; read under the latest definition's rules: grantCode=${details.grantCode}, major=${details.major}, reason=${details.errorMessage}`
  },
  NO_PINNED_MAJOR: {
    level: 'info',
    messageFunc: (details) =>
      `Applications listed without a pinned grant major; read under the latest definition's rules: grantCode=${details.grantCode}, applications=${details.applicationRefs}`
  }
}

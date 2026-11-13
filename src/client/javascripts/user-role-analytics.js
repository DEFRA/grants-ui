const STORAGE_KEY = 'grants-ui:user-role-context'
let publishedContext

// Publish the role only once for the active session/business context.
// Storage contains an opaque context token, never a CRN, SBI or authentication token.
export function publishUserRole() {
  const element = document.getElementById('user-role-analytics')
  if (!(element instanceof HTMLElement)) {
    return
  }
  const { role, context } = element.dataset
  if (!role || !context || publishedContext === context) {
    return
  }

  let previous
  try {
    previous = localStorage.getItem(STORAGE_KEY)
  } catch {
    // Restricted storage must not prevent analytics or page rendering.
  }

  if (previous === context) {
    return
  }
  globalThis.dataLayer = globalThis.dataLayer || []
  globalThis.dataLayer.push({ event: 'user_role_loaded', userRole: role })
  publishedContext = context
  try {
    localStorage.setItem(STORAGE_KEY, context)
  } catch {
    // Without storage, deduplication is limited to this document.
  }
}

export function initialiseUserRoleAnalytics() {
  if (document.getElementById('user-role-analytics')?.dataset.consent === 'true') {
    publishUserRole()
  }
}

const STORAGE_KEY = 'grants-ui:user-role-context'
let publishedContext

// Restore the value on each document; only the named event is deduplicated.
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

  globalThis.dataLayer = globalThis.dataLayer || []
  if (previous !== context) {
    globalThis.dataLayer.push({ event: 'user_role_loaded', userRole: role })
  } else {
    const latestRole = globalThis.dataLayer
      .slice()
      .reverse()
      .find((entry) => entry && Object.hasOwn(entry, 'userRole'))
    if (!latestRole || typeof latestRole !== 'object' || !('userRole' in latestRole) || latestRole.userRole !== role) {
      globalThis.dataLayer.push({ userRole: role })
    }
  }
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

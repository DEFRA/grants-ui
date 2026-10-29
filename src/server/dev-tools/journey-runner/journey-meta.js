// Per-journey CRNs and known-blocked journeys, read by the `gt` CLI. No imports,
// so it loads without the server's `~/` alias.

// Generic CRN for the many grants whose allowlist is `allowAll: true`.
// All CRNs here are synthetic personas from grants-platform-dal-stub (see its
// README); the Defra ID stub's users.json must list the same CRN/SBI pairs.
export const DEFAULT_CRN = '9000000001'

/**
 * SBI 800000001 (Test Alder Carr Farm) test users, one per Countryside Stewardship
 * permission level, from the grants-platform-dal-stub relationship fixtures.
 * @type {{crn: string, note: string}[]}
 */
const CS_PERMISSION_CRNS = [
  { crn: '9000000001', note: 'csApplications: SUBMIT, csAgreements: SUBMIT (every group at its highest level)' },
  { crn: '9000000002', note: 'csApplications: AMEND, csAgreements: AMEND' },
  { crn: '9000000003', note: 'csApplications: VIEW, csAgreements: VIEW' },
  { crn: '9000000004', note: 'no permission groups' }
]

/**
 * CRNs for journeys that need a specific one (allowlist not `allowAll`) or a
 * second that reaches other seed data. First is the default; the TUI prompts only
 * when there are several. From compose/config-broker/local-allowlists/*.yaml.
 * @type {Record<string, {crn: string, note: string}[]>}
 */
export const JOURNEY_CRNS = {
  'example-grant-with-auth': [...CS_PERMISSION_CRNS],
  woodland: [...CS_PERMISSION_CRNS],
  'farm-payments': [{ crn: '9000000001', note: 'farm-payments allowlist + seeded land parcels' }],

  // The former "no eligible actions" CRN (parcels SK0972-6811/7313) has no
  // synthetic persona yet; add one to grants-platform-dal-stub to restore it.
  grasslands: [{ crn: '9000000001', note: 'parcels with eligible actions — the happy path' }]
  // methane is `allowAll` once seeded (see SELF_SEED_GRANTS), so it uses DEFAULT_CRN.
}

/**
 * Journeys that won't complete on a standard local stack; one printed line per
 * entry, shown as a warning the user must acknowledge.
 * @type {Record<string, string[]>}
 */
export const WONT_COMPLETE = {
  'farm-payments': [
    'It stops at "select-actions-for-land-parcel": the offered actions (CMOR1, UPL1–UPL3) are',
    'moorland-only, and the local land-grants seed has no majority-moorland parcel, so every',
    'parcel is rejected with "This parcel is not majority on the moorland".',
    'This is backend seed data, not a journey bug.'
  ],
  methane: [
    'Every CRN is turned away at /auth/journey-unauthorised. methane is a frontend-code-only grant',
    'not known to grants-ui-backend, whose allowlist only governs config-broker grants — so it has',
    'no way to authorise methane (seeding config__allowlist_entries is ignored). This needs an',
    'architecture change (skip the backend allowlist for local grants, or onboard methane), not a seed.'
  ]
}

/**
 * Unlisted journeys are `allowAll`, so DEFAULT_CRN is offered.
 * @param {string} slug
 * @returns {{crn: string, note: string}[]}
 */
export function journeyCrnOptions(slug) {
  if (slug in JOURNEY_CRNS) {
    return JOURNEY_CRNS[slug]
  }
  return [{ crn: DEFAULT_CRN, note: 'allowlisted for all CRNs' }]
}

/**
 * @param {string} slug
 * @returns {string}
 */
export function defaultCrn(slug) {
  return journeyCrnOptions(slug)[0]?.crn ?? DEFAULT_CRN
}

/**
 * @param {string} slug
 * @returns {string[] | null}
 */
export function wontCompleteReason(slug) {
  return WONT_COMPLETE[slug] ?? null
}

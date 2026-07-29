import { buildServiceBranding } from '~/src/config/nunjucks/context/build-service-branding.js'

/**
 * @param {string | undefined} phase
 */
const requestWithPhase = (phase) => ({
  app: { model: { def: { metadata: { phase } } } }
})

describe('buildServiceBranding', () => {
  test('defaults to private-beta restricted branding when there is no request', () => {
    expect(buildServiceBranding(undefined)).toEqual({
      grantPhase: 'private-beta',
      govukBranding: false
    })
  })

  test('defaults to private-beta restricted branding when grant metadata has no phase', () => {
    expect(buildServiceBranding({ app: { model: { def: { metadata: {} } } } })).toEqual({
      grantPhase: 'private-beta',
      govukBranding: false
    })
  })

  test('restricts branding for an explicit private-beta phase', () => {
    expect(buildServiceBranding(requestWithPhase('private-beta'))).toEqual({
      grantPhase: 'private-beta',
      govukBranding: false
    })
  })

  test('falls back to restricted branding for an unrecognised phase value', () => {
    expect(buildServiceBranding(requestWithPhase('fully-live-honest'))).toEqual({
      grantPhase: 'private-beta',
      govukBranding: false
    })
  })

  test.each(['public-beta', 'live'])('enables full GOV.UK branding for %s phase', (phase) => {
    expect(buildServiceBranding(requestWithPhase(phase))).toEqual({
      grantPhase: phase,
      govukBranding: true
    })
  })
})

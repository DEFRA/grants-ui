import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSfdFormActionSources } from './get-sfd-form-action-sources.js'

const mockError = vi.fn()

vi.mock('~/src/server/common/helpers/logging/log.js', () => ({
  error: (...args) => mockError(...args),
  LogCodes: {
    SYSTEM: {
      CSP_SFD_UPDATE_URL_INVALID: { level: 'error' },
      CSP_IDENTITY_PROVIDER_ORIGIN_INVALID: { level: 'error' }
    }
  }
}))

describe('getSfdFormActionSources', () => {
  beforeEach(() => {
    mockError.mockClear()
  })

  it('returns no sources when SFD is disabled', () => {
    expect(
      getSfdFormActionSources({
        isSfdEnabled: false,
        sfdUpdateUrl: 'https://sfd.example.com/update-sbi',
        identityProviderOrigin: 'https://identity.example.com'
      })
    ).toEqual([])
    expect(mockError).not.toHaveBeenCalled()
  })

  it('returns no sources when the SFD update URL is missing', () => {
    expect(
      getSfdFormActionSources({
        isSfdEnabled: true,
        sfdUpdateUrl: '',
        identityProviderOrigin: 'https://identity.example.com'
      })
    ).toEqual([])
    expect(mockError).not.toHaveBeenCalled()
  })

  it('returns no sources and logs when the SFD update URL is malformed', () => {
    expect(
      getSfdFormActionSources({
        isSfdEnabled: true,
        sfdUpdateUrl: 'not a URL',
        identityProviderOrigin: 'https://identity.example.com'
      })
    ).toEqual([])
    expect(mockError).toHaveBeenCalledWith(expect.objectContaining({ level: 'error' }), {
      sfdUpdateUrl: 'not a URL'
    })
  })

  it('returns the SFD origin and logs when the identity provider origin is unavailable', () => {
    expect(
      getSfdFormActionSources({
        isSfdEnabled: true,
        sfdUpdateUrl: 'https://sfd.example.com/update-sbi',
        identityProviderOrigin: null
      })
    ).toEqual(['https://sfd.example.com'])
    expect(mockError).toHaveBeenCalledWith(expect.objectContaining({ level: 'error' }), {
      identityProviderOrigin: null
    })
  })

  it('returns the SFD and identity provider origins when both are valid', () => {
    expect(
      getSfdFormActionSources({
        isSfdEnabled: true,
        sfdUpdateUrl: ' https://sfd.example.com/update-sbi ',
        identityProviderOrigin: 'https://identity.example.com'
      })
    ).toEqual(['https://sfd.example.com', 'https://identity.example.com'])
    expect(mockError).not.toHaveBeenCalled()
  })
})

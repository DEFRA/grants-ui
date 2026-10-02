import { describe, expect, it, vi } from 'vitest'
import { applicationDeletedRedirect } from './application-deleted-redirect.js'

describe('applicationDeletedRedirect', () => {
  const h = {
    continue: Symbol('continue'),
    redirect: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns h.continue when application is not PURGED', () => {
    const request = {
      params: {
        slug: 'test-grant'
      },
      path: '/test-grant/start'
    }

    const context = {
      state: {
        applicationStatus: 'IN_PROGRESS'
      }
    }

    const result = applicationDeletedRedirect(request, h, context)

    expect(result).toBe(h.continue)
    expect(h.redirect).not.toHaveBeenCalled()
  })

  it('redirects to application-deleted page when application is PURGED', () => {
    const takeover = Symbol('takeover')

    h.redirect.mockReturnValue({
      takeover: () => takeover
    })

    const request = {
      params: {
        slug: 'test-grant'
      },
      path: '/test-grant/start'
    }

    const context = {
      state: {
        applicationStatus: 'PURGED'
      }
    }

    const result = applicationDeletedRedirect(request, h, context)

    expect(h.redirect).toHaveBeenCalledWith('/test-grant/application-deleted')
    expect(result).toBe(takeover)
  })

  it('returns h.continue when already on application-deleted page', () => {
    const request = {
      params: {
        slug: 'test-grant'
      },
      path: '/test-grant/application-deleted'
    }

    const context = {
      state: {
        applicationStatus: 'PURGED'
      }
    }

    const result = applicationDeletedRedirect(request, h, context)

    expect(result).toBe(h.continue)
    expect(h.redirect).not.toHaveBeenCalled()
  })

  it('redirects to root application-deleted page when slug is missing', () => {
    const takeover = Symbol('takeover')

    h.redirect.mockReturnValue({
      takeover: () => takeover
    })

    const request = {
      params: {},
      path: '/some-page'
    }

    const context = {
      state: {
        applicationStatus: 'PURGED'
      }
    }

    const result = applicationDeletedRedirect(request, h, context)

    expect(h.redirect).toHaveBeenCalledWith('/application-deleted')
    expect(result).toBe(takeover)
  })

  it('preserves ?ref= on the redirect so a multi-application delete stays scoped to that application', () => {
    const takeover = Symbol('takeover')

    h.redirect.mockReturnValue({
      takeover: () => takeover
    })

    const request = {
      params: {
        slug: 'test-grant'
      },
      path: '/test-grant/start',
      query: {
        ref: 'REF-A'
      }
    }

    const context = {
      state: {
        applicationStatus: 'PURGED'
      }
    }

    const result = applicationDeletedRedirect(request, h, context)

    expect(h.redirect).toHaveBeenCalledWith('/test-grant/application-deleted?ref=REF-A')
    expect(result).toBe(takeover)
  })

  it('url-encodes a ref containing special characters', () => {
    const takeover = Symbol('takeover')

    h.redirect.mockReturnValue({
      takeover: () => takeover
    })

    const request = {
      params: {
        slug: 'test-grant'
      },
      path: '/test-grant/start',
      query: {
        ref: 'REF A/1'
      }
    }

    const context = {
      state: {
        applicationStatus: 'PURGED'
      }
    }

    applicationDeletedRedirect(request, h, context)

    expect(h.redirect).toHaveBeenCalledWith('/test-grant/application-deleted?ref=REF%20A%2F1')
  })

  it('returns h.continue when already on application-deleted page, ref included', () => {
    const request = {
      params: {
        slug: 'test-grant'
      },
      path: '/test-grant/application-deleted',
      query: {
        ref: 'REF-A'
      }
    }

    const context = {
      state: {
        applicationStatus: 'PURGED'
      }
    }

    const result = applicationDeletedRedirect(request, h, context)

    expect(result).toBe(h.continue)
    expect(h.redirect).not.toHaveBeenCalled()
  })
})

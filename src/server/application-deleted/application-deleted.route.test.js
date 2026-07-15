import { describe, it, expect, vi, beforeEach } from 'vitest'
import { applicationDeletedGetRoute } from './application-deleted.route.js'

const getState = vi.fn()
const setState = vi.fn()
const clearState = vi.fn()

vi.mock('../common/helpers/logging/log.js', () => ({
  log: vi.fn(),
  LogCodes: {
    PURGE: {
      STATE_CLEAR_SUCCESS: 'STATE_CLEAR_SUCCESS',
      STATE_CLEAR_FAILURE: 'STATE_CLEAR_FAILURE'
    }
  }
}))

import { log } from '../common/helpers/logging/log.js'

vi.mock('../common/helpers/forms-cache/forms-cache.js', () => ({
  getFormsCacheService: vi.fn(() => ({
    getState,
    setState,
    clearState
  }))
}))

describe('applicationDeletedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the application deleted page', async () => {
    const { applicationDeletedGetRoute } = await import('./application-deleted.route.js')

    const request = {
      params: {
        slug: 'test-grant'
      },
      server: {}
    }

    const view = vi.fn()

    const h = { view }

    getState.mockResolvedValue({})

    await applicationDeletedGetRoute.handler(/** @type {any} */ (request), /** @type {any} */ (h))

    expect(view).toHaveBeenCalledWith('application-deleted', {
      href: '/test-grant',
      pageTitle: 'Your draft application has been deleted',
      text: 'Return to summary'
    })

    expect(setState).not.toHaveBeenCalled()
  })

  it('clears state when application status is PURGED', async () => {
    const { applicationDeletedGetRoute } = await import('./application-deleted.route.js')

    const request = {
      params: {
        slug: 'test-grant'
      },
      server: {}
    }

    const view = vi.fn()

    const h = { view }

    getState.mockResolvedValue({
      applicationStatus: 'PURGED'
    })

    await applicationDeletedGetRoute.handler(/** @type {any} */ (request), /** @type {any} */ (h))

    expect(setState).toHaveBeenCalledTimes(1)
    expect(setState).toHaveBeenCalledWith(request, { applicationStatus: 'PURGED' })

    expect(view).toHaveBeenCalledWith('application-deleted', {
      href: '/test-grant',
      pageTitle: 'Your draft application has been deleted',
      text: 'Return to summary'
    })
    expect(log).toHaveBeenCalledWith(
      'STATE_CLEAR_SUCCESS',
      {
        slug: 'test-grant'
      },
      request
    )
  })

  it('does not clear state when application status is not PURGED', async () => {
    const { applicationDeletedGetRoute } = await import('./application-deleted.route.js')

    const request = {
      params: {
        slug: 'test-grant'
      },
      server: {}
    }

    const view = vi.fn()

    const h = { view }

    getState.mockResolvedValue({
      applicationStatus: 'IN_PROGRESS'
    })

    await applicationDeletedGetRoute.handler(/** @type {any} */ (request), /** @type {any} */ (h))

    expect(setState).not.toHaveBeenCalled()
  })

  it('logs and handles errors when state retrieval fails', async () => {
    const { applicationDeletedGetRoute } = await import('./application-deleted.route.js')

    const request = {
      params: {
        slug: 'test-grant'
      },
      server: {}
    }

    const view = vi.fn()
    const h = { view }

    getState.mockRejectedValue(new Error('Redis unavailable'))

    await applicationDeletedGetRoute.handler(/** @type {any} */ (request), /** @type {any} */ (h))

    expect(log).toHaveBeenCalledWith(
      'STATE_CLEAR_FAILURE',
      {
        slug: 'test-grant',
        errorMessage: 'Redis unavailable'
      },
      request
    )
  })

  it('still renders the page when state retrieval fails', async () => {
    const request = {
      params: {
        slug: 'test-grant'
      },
      server: {}
    }
    const view = vi.fn()
    const h = { view }
    getState.mockRejectedValue(new Error('Redis unavailable'))

    await applicationDeletedGetRoute.handler(request, h)

    expect(view).toHaveBeenCalledWith('application-deleted', {
      href: '/test-grant',
      pageTitle: 'Your draft application has been deleted',
      text: 'Return to summary'
    })
  })

  it('does not clear state when no state exists', async () => {
    const { applicationDeletedGetRoute } = await import('./application-deleted.route.js')

    const request = {
      params: {
        slug: 'test-grant'
      },
      server: {}
    }

    const view = vi.fn()

    const h = { view }

    getState.mockResolvedValue(undefined)

    await applicationDeletedGetRoute.handler(/** @type {any} */ (request), /** @type {any} */ (h))

    expect(setState).not.toHaveBeenCalled()
  })
})

describe('applicationDeletedPostRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('clears state and redirects to grant root', async () => {
    const { applicationDeletedPostRoute } = await import('./application-deleted.route.js')

    const redirect = vi.fn()

    const request = {
      params: {
        slug: 'test-grant'
      },
      server: {}
    }

    const h = {
      redirect
    }

    await applicationDeletedPostRoute.handler(/** @type {any} */ (request), /** @type {any} */ (h))

    expect(clearState).toHaveBeenCalledTimes(1)
    expect(clearState).toHaveBeenCalledWith(request, true)

    expect(redirect).toHaveBeenCalledWith('/test-grant')
  })

  it('propagates errors from clearState', async () => {
    const { applicationDeletedPostRoute } = await import('./application-deleted.route.js')

    const error = new Error('Redis unavailable')

    clearState.mockRejectedValue(error)

    const request = {
      params: {
        slug: 'test-grant'
      },
      server: {}
    }

    const h = {
      redirect: vi.fn()
    }

    await expect(
      applicationDeletedPostRoute.handler(/** @type {any} */ (request), /** @type {any} */ (h))
    ).rejects.toThrow('Redis unavailable')

    expect(h.redirect).not.toHaveBeenCalled()
  })
})

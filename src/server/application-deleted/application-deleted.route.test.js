import { describe, it, expect, vi, beforeEach } from 'vitest'
import { applicationDeletedRoute } from './application-deleted.route.js'

const getState = vi.fn()
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
    clearState
  }))
}))

describe('applicationDeletedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the application deleted page', async () => {
    const { applicationDeletedRoute } = await import('./application-deleted.route.js')

    const request = {
      params: {
        slug: 'test-grant'
      },
      server: {}
    }

    const view = vi.fn()

    const h = { view }

    getState.mockResolvedValue({})

    await applicationDeletedRoute.handler(/** @type {any} */ (request), /** @type {any} */ (h))

    expect(view).toHaveBeenCalledWith('application-deleted', {
      slug: 'test-grant',
      pageTitle: 'Your draft application has been deleted'
    })

    expect(clearState).not.toHaveBeenCalled()
  })

  it('clears state when application status is PURGED', async () => {
    const { applicationDeletedRoute } = await import('./application-deleted.route.js')

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

    await applicationDeletedRoute.handler(/** @type {any} */ (request), /** @type {any} */ (h))

    expect(clearState).toHaveBeenCalledTimes(1)
    expect(clearState).toHaveBeenCalledWith(request, true)

    expect(view).toHaveBeenCalledWith('application-deleted', {
      slug: 'test-grant',
      pageTitle: 'Your draft application has been deleted'
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
    const { applicationDeletedRoute } = await import('./application-deleted.route.js')

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

    await applicationDeletedRoute.handler(/** @type {any} */ (request), /** @type {any} */ (h))

    expect(clearState).not.toHaveBeenCalled()
  })

  it('logs and handles errors when state retrieval fails', async () => {
    const { applicationDeletedRoute } = await import('./application-deleted.route.js')

    const request = {
      params: {
        slug: 'test-grant'
      },
      server: {}
    }

    const view = vi.fn()
    const h = { view }

    getState.mockRejectedValue(new Error('Redis unavailable'))

    await applicationDeletedRoute.handler(/** @type {any} */ (request), /** @type {any} */ (h))

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

    await applicationDeletedRoute.handler(request, h)

    expect(view).toHaveBeenCalledWith('application-deleted', {
      slug: 'test-grant',
      pageTitle: 'Your draft application has been deleted'
    })
  })

  it('does not clear state when no state exists', async () => {
    const { applicationDeletedRoute } = await import('./application-deleted.route.js')

    const request = {
      params: {
        slug: 'test-grant'
      },
      server: {}
    }

    const view = vi.fn()

    const h = { view }

    getState.mockResolvedValue(undefined)

    await applicationDeletedRoute.handler(/** @type {any} */ (request), /** @type {any} */ (h))

    expect(clearState).not.toHaveBeenCalled()
  })
})

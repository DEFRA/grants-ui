import { describe, it, expect, vi, beforeEach } from 'vitest'

const getState = vi.fn()
const clearState = vi.fn()

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

import { describe, expect, it, vi } from 'vitest'
import { applicationWindowClosedGetRoute } from './application-window-closed.route.js'

describe('applicationWindowClosedGetRoute', () => {
  it('renders the page with the scheme name from the yar flash and clears it', () => {
    const view = vi.fn()
    const clear = vi.fn()
    const get = vi.fn().mockReturnValue('Test Grant')

    const request = {
      params: { slug: 'test-grant' },
      yar: { get, clear }
    }
    const h = { view }

    applicationWindowClosedGetRoute.handler(request, h)

    expect(get).toHaveBeenCalledWith('applicationWindowClosedSchemeName')
    expect(clear).toHaveBeenCalledWith('applicationWindowClosedSchemeName')
    expect(view).toHaveBeenCalledWith('application-window-closed', {
      pageTitle: 'Application window closed',
      schemeName: 'Test Grant'
    })
  })

  it('falls back to generic wording when no scheme name is flashed', () => {
    const view = vi.fn()
    const request = {
      params: { slug: 'test-grant' },
      yar: { get: vi.fn().mockReturnValue(undefined), clear: vi.fn() }
    }
    const h = { view }

    applicationWindowClosedGetRoute.handler(request, h)

    expect(view).toHaveBeenCalledWith('application-window-closed', {
      pageTitle: 'Application window closed',
      schemeName: 'this scheme'
    })
  })
})

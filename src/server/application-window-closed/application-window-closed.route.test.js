import { describe, expect, it, vi } from 'vitest'
import { applicationWindowClosedGetRoute } from './application-window-closed.route.js'

describe('applicationWindowClosedGetRoute', () => {
  function buildRequest(schemeNames, slug = 'test-grant') {
    return {
      params: { slug },
      yar: { get: vi.fn().mockReturnValue(schemeNames), clear: vi.fn() }
    }
  }

  it('renders the page with the scheme name stored for this slug', () => {
    const view = vi.fn()
    const request = buildRequest({ 'test-grant': 'Test Grant' })

    applicationWindowClosedGetRoute.handler(request, { view })

    expect(request.yar.get).toHaveBeenCalledWith('applicationWindowClosedSchemeName')
    expect(view).toHaveBeenCalledWith('application-window-closed', {
      pageTitle: 'Application window closed',
      schemeName: 'Test Grant'
    })
  })

  it('keeps the scheme name so a refresh still shows it', () => {
    const view = vi.fn()
    const request = buildRequest({ 'test-grant': 'Test Grant' })

    applicationWindowClosedGetRoute.handler(request, { view })
    applicationWindowClosedGetRoute.handler(request, { view })

    expect(request.yar.clear).not.toHaveBeenCalled()
    expect(view).toHaveBeenLastCalledWith('application-window-closed', {
      pageTitle: 'Application window closed',
      schemeName: 'Test Grant'
    })
  })

  it("does not show another grant's scheme name", () => {
    const view = vi.fn()
    const request = buildRequest({ 'other-grant': 'Other Grant' })

    applicationWindowClosedGetRoute.handler(request, { view })

    expect(view).toHaveBeenCalledWith('application-window-closed', {
      pageTitle: 'Application window closed',
      schemeName: 'this scheme'
    })
  })

  it('falls back to generic wording when no scheme name is stored', () => {
    const view = vi.fn()
    const request = buildRequest(undefined)

    applicationWindowClosedGetRoute.handler(request, { view })

    expect(view).toHaveBeenCalledWith('application-window-closed', {
      pageTitle: 'Application window closed',
      schemeName: 'this scheme'
    })
  })
})

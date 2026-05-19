import { describe, test, expect, vi } from 'vitest'
import { cannotSubmitRoute } from './cannot-submit.route.js'

describe('cannotSubmitRoute', () => {
  test('has correct method and path', () => {
    expect(cannotSubmitRoute.method).toBe('GET')
    expect(cannotSubmitRoute.path).toBe('/cannot-submit')
  })

  test('renders cannot-submit view with returnUrl from query', () => {
    const request = {
      query: {
        returnUrl: '/task-list'
      }
    }

    const h = {
      view: vi.fn().mockReturnValue('rendered-view')
    }

    const result = cannotSubmitRoute.handler(request, h)

    expect(h.view).toHaveBeenCalledWith('cannot-submit', {
      returnUrl: '/task-list'
    })

    expect(result).toBe('rendered-view')
  })

  test('renders cannot-submit view with undefined returnUrl when absent', () => {
    const request = {
      query: {}
    }

    const h = {
      view: vi.fn().mockReturnValue('rendered-view')
    }

    const result = cannotSubmitRoute.handler(request, h)

    expect(h.view).toHaveBeenCalledWith('cannot-submit', {
      returnUrl: undefined
    })

    expect(result).toBe('rendered-view')
  })
})

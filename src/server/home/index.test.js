import { expect, test, vi } from 'vitest'

import { home } from './index.js'

test('registers a protected home route and an optional-auth root route', () => {
  const route = vi.fn()

  home.plugin.register({ route })

  const registeredRoutes = route.mock.calls.flatMap(([routes]) => routes)
  expect(registeredRoutes).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ method: 'GET', path: '/home' }),
      expect.objectContaining({
        method: 'GET',
        path: '/',
        options: { auth: { strategy: 'session', mode: 'try' } }
      })
    ])
  )
})

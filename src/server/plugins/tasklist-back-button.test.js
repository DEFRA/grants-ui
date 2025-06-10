import { tasklistBackButton } from './tasklist-back-button.js'

describe('tasklistBackButton plugin', () => {
  let server
  let h
  let setIntervalSpy

  beforeEach(() => {
    server = {
      ext: jest.fn()
    }

    h = {
      continue: Symbol('continue')
    }

    jest.useFakeTimers()
    setIntervalSpy = jest.spyOn(global, 'setInterval')
  })

  afterEach(() => {
    jest.clearAllMocks()
    jest.restoreAllMocks()
    jest.useRealTimers()
  })

  describe('plugin registration', () => {
    it('should have correct plugin structure', () => {
      expect(tasklistBackButton).toHaveProperty('plugin')
      expect(tasklistBackButton.plugin).toHaveProperty(
        'name',
        'tasklist-back-button'
      )
      expect(tasklistBackButton.plugin).toHaveProperty('register')
      expect(typeof tasklistBackButton.plugin.register).toBe('function')
    })

    it('should register onPreResponse extension', () => {
      tasklistBackButton.plugin.register(server)
      expect(server.ext).toHaveBeenCalledWith(
        'onPreResponse',
        expect.any(Function)
      )
    })

    it('should set up periodic cleanup', () => {
      tasklistBackButton.plugin.register(server)
      expect(setIntervalSpy).toHaveBeenCalledWith(
        expect.any(Function),
        60 * 60 * 1000
      )
    })
  })

  describe('onPreResponse handler', () => {
    let handler

    beforeEach(() => {
      tasklistBackButton.plugin.register(server)
      handler = server.ext.mock.calls[0][1]
    })

    describe('when source=adding-value-tasklist', () => {
      it('should preserve source parameter on redirect and set session flag', () => {
        const request = {
          query: { source: 'adding-value-tasklist' },
          path: '/business-status',
          yar: { id: 'session-123', set: jest.fn() },
          response: {
            isBoom: false,
            variety: 'plain',
            headers: {
              location: '/business-status/nature-of-business'
            }
          }
        }

        handler(request, h)

        expect(request.yar.set).toHaveBeenCalledWith('fromTasklist', true)
        expect(request.response.headers.location).toBe(
          '/business-status/nature-of-business?source=adding-value-tasklist'
        )
      })

      it('should handle redirects with existing query parameters', () => {
        const request = {
          query: { source: 'adding-value-tasklist' },
          path: '/business-status',
          yar: { id: 'session-123', set: jest.fn() },
          response: {
            isBoom: false,
            variety: 'plain',
            headers: {
              location: '/business-status/nature-of-business?mock=query'
            }
          }
        }

        handler(request, h)

        expect(request.response.headers.location).toBe(
          '/business-status/nature-of-business?mock=query&source=adding-value-tasklist'
        )
      })

      it('should continue without modification for non-redirect responses', () => {
        const request = {
          query: { source: 'adding-value-tasklist' },
          path: '/business-status',
          yar: { id: 'session-123', set: jest.fn() },
          response: { variety: 'view' }
        }

        const result = handler(request, h)

        expect(request.yar.set).toHaveBeenCalledWith('fromTasklist', true)
        expect(result).toBe(h.continue)
      })
    })

    describe('when processing first pages', () => {
      it('should add back link for first page after redirect', () => {
        const request1 = {
          query: { source: 'adding-value-tasklist' },
          path: '/business-status',
          yar: { id: 'session-123', set: jest.fn(), get: jest.fn() },
          response: { variety: 'plain' }
        }
        handler(request1, h)

        const request2 = {
          query: {},
          path: '/business-status/nature-of-business',
          yar: { id: 'session-123', set: jest.fn(), get: jest.fn() },
          response: {
            variety: 'view',
            source: {
              context: {}
            }
          }
        }
        handler(request2, h)

        expect(request2.response.source.context.backLink).toEqual({
          text: 'Back to task list',
          href: '/adding-value-tasklist'
        })
      })

      it('should add back link on page refresh when fromTasklist is in session', () => {
        const request = {
          query: {},
          path: '/business-status/nature-of-business',
          yar: {
            id: 'session-123',
            get: jest.fn().mockReturnValue(true),
            set: jest.fn()
          },
          response: {
            variety: 'view',
            source: {
              context: {}
            }
          }
        }

        handler(request, h)

        expect(request.yar.get).toHaveBeenCalledWith('fromTasklist')
        expect(request.response.source.context.backLink).toEqual({
          text: 'Back to task list',
          href: '/adding-value-tasklist'
        })
      })

      it('should clear session flag and tasklist sessions when navigating away from first page', () => {
        const request1 = {
          query: { source: 'adding-value-tasklist' },
          path: '/business-status',
          yar: { id: 'session-123', set: jest.fn(), get: jest.fn() },
          response: { variety: 'plain' }
        }
        handler(request1, h)

        const request2 = {
          query: {},
          path: '/business-status/legal-status',
          yar: {
            id: 'session-123',
            set: jest.fn(),
            get: jest.fn().mockReturnValue(true)
          },
          response: {
            variety: 'view',
            source: { context: {} }
          }
        }
        handler(request2, h)

        expect(request2.yar.set).toHaveBeenCalledWith('fromTasklist', false)
        expect(request2.response.source.context.backLink).toBeUndefined()
      })

      it('should not add back link for non-first pages', () => {
        const request1 = {
          query: { source: 'adding-value-tasklist' },
          path: '/business-status',
          yar: { id: 'session-123', set: jest.fn(), get: jest.fn() },
          response: { variety: 'plain' }
        }
        handler(request1, h)

        const request2 = {
          query: {},
          path: '/business-status/legal-status',
          yar: { id: 'session-123', set: jest.fn(), get: jest.fn() },
          response: {
            variety: 'view',
            source: {
              context: {}
            }
          }
        }
        handler(request2, h)

        expect(request2.response.source.context.backLink).toBeUndefined()
      })

      it('should handle missing session gracefully', () => {
        const request = {
          query: {},
          path: '/business-status/nature-of-business',
          yar: { get: jest.fn(), set: jest.fn() },
          response: { variety: 'view' }
        }

        const result = handler(request, h)

        expect(result).toBe(h.continue)
      })

      it('should handle yar.get throwing an error gracefully', () => {
        const request = {
          query: {},
          path: '/business-status/nature-of-business',
          yar: {
            get: jest.fn().mockImplementation(() => {
              throw new Error('Session not available')
            }),
            set: jest.fn()
          },
          response: { variety: 'view' }
        }

        const result = handler(request, h)

        expect(result).toBe(h.continue)
      })

      it('should handle missing context gracefully', () => {
        const request1 = {
          query: { source: 'adding-value-tasklist' },
          path: '/business-status',
          yar: { id: 'session-123', set: jest.fn(), get: jest.fn() },
          response: { variety: 'plain' }
        }
        handler(request1, h)

        const request2 = {
          query: {},
          path: '/business-status/nature-of-business',
          yar: { id: 'session-123', set: jest.fn(), get: jest.fn() },
          response: {
            variety: 'view',
            source: {}
          }
        }
        const result = handler(request2, h)

        expect(result).toBe(h.continue)
        expect(request2.response.source.context).toBeUndefined()
      })
    })

    describe('edge cases', () => {
      it('should handle missing response', () => {
        const request = {
          query: {},
          path: '/business-status/nature-of-business',
          yar: { get: jest.fn(), set: jest.fn() }
        }

        const result = handler(request, h)

        expect(result).toBe(h.continue)
      })

      it('should skip non-view responses', () => {
        const request = {
          query: {},
          path: '/business-status/nature-of-business',
          yar: { id: 'session-123', set: jest.fn(), get: jest.fn() },
          response: { variety: 'plain' }
        }

        const result = handler(request, h)

        expect(result).toBe(h.continue)
      })

      it('should handle boom responses correctly', () => {
        const request = {
          query: { source: 'adding-value-tasklist' },
          path: '/business-status',
          yar: { id: 'session-123', set: jest.fn(), get: jest.fn() },
          response: {
            isBoom: true,
            variety: 'plain',
            headers: {
              location: '/error'
            }
          }
        }

        handler(request, h)

        expect(request.response.headers.location).toBe('/error')
      })
    })

    describe('cleanup interval', () => {
      it('should clear tasklist sessions periodically', () => {
        tasklistBackButton.plugin.register(server)
        const handler = server.ext.mock.calls[0][1]

        const request1 = {
          query: { source: 'adding-value-tasklist' },
          path: '/business-status',
          yar: { id: 'session-1', set: jest.fn(), get: jest.fn() },
          response: { variety: 'plain' }
        }

        const request2 = {
          query: { source: 'adding-value-tasklist' },
          path: '/costs',
          yar: { id: 'session-2', set: jest.fn(), get: jest.fn() },
          response: { variety: 'plain' }
        }

        handler(request1, h)
        handler(request2, h)

        const firstPageRequest = {
          query: {},
          path: '/business-status/nature-of-business',
          yar: { id: 'session-1', set: jest.fn(), get: jest.fn() },
          response: {
            variety: 'view',
            source: { context: {} }
          }
        }

        handler(firstPageRequest, h)
        expect(firstPageRequest.response.source.context.backLink).toBeDefined()

        jest.advanceTimersByTime(60 * 60 * 1000) // 1 hour

        const afterCleanupRequest = {
          query: {},
          path: '/business-status/nature-of-business',
          yar: {
            id: 'session-1',
            set: jest.fn(),
            get: jest.fn().mockReturnValue(false)
          },
          response: {
            variety: 'view',
            source: { context: {} }
          }
        }

        handler(afterCleanupRequest, h)
        expect(
          afterCleanupRequest.response.source.context.backLink
        ).toBeUndefined()
      })
    })

    describe('non-view response handling', () => {
      it('should continue without modification for non-view responses when session exists', () => {
        tasklistBackButton.plugin.register(server)
        const handler = server.ext.mock.calls[0][1]

        const setupRequest = {
          query: { source: 'adding-value-tasklist' },
          path: '/business-status',
          yar: { id: 'session-123', set: jest.fn(), get: jest.fn() },
          response: { variety: 'plain' }
        }
        handler(setupRequest, h)

        const nonViewRequest = {
          query: {},
          path: '/business-status/download',
          yar: { id: 'session-123', set: jest.fn(), get: jest.fn() },
          response: {
            variety: 'file',
            source: { filename: 'test.pdf' }
          }
        }

        const result = handler(nonViewRequest, h)

        expect(result).toBe(h.continue)
        expect(nonViewRequest.response.source.context).toBeUndefined()
      })
    })
  })
})

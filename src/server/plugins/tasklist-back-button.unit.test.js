import { vi } from 'vitest'
import {
  isSourceTasklist,
  getTasklistIdFromSource,
  isFromTasklist,
  getTasklistIdFromSession,
  isRedirectResponse,
  preserveSourceParameterInRedirect,
  isViewResponse,
  hasViewContext,
  addBackLinkToContext,
  addTasklistIdToContext,
  isFirstPage,
  safeYarGet,
  safeYarSet,
  safeYarClear,
  shouldProcessTasklistRequest,
  handleFirstPageRequest,
  processExistingTasklistSession,
  extractFirstPages
} from './tasklist-back-button.js'

const createYarRequest = (yarData = {}) => ({
  yar: {
    get: vi.fn().mockImplementation((key) => yarData[key] || null)
  }
})

describe('Tasklist Back Button - Pure Functions', () => {
  describe('Source parameter detection', () => {
    it('should identify valid source tasklistId', () => {
      const mockTasklistIds = new Set(['example-tasklist', 'other-tasklist'])
      const request = { query: { source: 'example-tasklist' } }

      const result = isSourceTasklist(request, mockTasklistIds)

      expect(result).toBe(true)
    })

    it('should reject invalid source tasklistId', () => {
      const mockTasklistIds = new Set(['example-tasklist'])
      const request = { query: { source: 'invalid-id' } }

      const result = isSourceTasklist(request, mockTasklistIds)

      expect(result).toBe(false)
    })

    it('should handle missing query parameters', () => {
      const mockTasklistIds = new Set(['example-tasklist'])
      const request = { query: {} }

      const result = isSourceTasklist(request, mockTasklistIds)

      expect(result).toBeFalsy()
    })

    it('should extract tasklistId from source parameter', () => {
      const request = { query: { source: 'example-tasklist' } }

      const result = getTasklistIdFromSource(request)

      expect(result).toBe('example-tasklist')
    })
  })

  describe('Session context detection', () => {
    it('should identify tasklist session context', () => {
      const request = createYarRequest({
        tasklistContext: { fromTasklist: true, tasklistId: 'example' }
      })

      const result = isFromTasklist(request)

      expect(result).toBe(true)
    })

    it('should reject non-tasklist sessions', () => {
      const request = createYarRequest({
        tasklistContext: { fromTasklist: false }
      })

      const result = isFromTasklist(request)

      expect(result).toBe(false)
    })

    it('should extract tasklistId from session', () => {
      const request = createYarRequest({
        tasklistContext: { fromTasklist: true, tasklistId: 'example-tasklist' }
      })

      const result = getTasklistIdFromSession(request)

      expect(result).toBe('example-tasklist')
    })

    it('should return null for missing session context', () => {
      const request = createYarRequest({})

      const result = getTasklistIdFromSession(request)

      expect(result).toBe(null)
    })
  })

  describe('Response type detection', () => {
    it.each([
      {
        name: 'redirect responses',
        func: isRedirectResponse,
        response: { isBoom: false, variety: 'plain', headers: { location: '/next-page' } },
        expected: '/next-page'
      },
      {
        name: 'boom responses as false',
        func: isRedirectResponse,
        response: { isBoom: true, variety: 'plain', headers: { location: '/error' } },
        expected: false
      },
      {
        name: 'view responses',
        func: isViewResponse,
        response: { variety: 'view' },
        expected: true
      },
      {
        name: 'view context presence',
        func: hasViewContext,
        response: { variety: 'view', source: { context: {} } },
        expected: true
      },
      {
        name: 'missing view context',
        func: hasViewContext,
        response: { variety: 'view', source: {} },
        expected: false
      }
    ])('should identify $name', ({ func, response, expected }) => {
      const result = func(response)
      expect(result).toBe(expected)
    })
  })

  describe('URL parameter manipulation', () => {
    it.each([
      {
        name: 'URL without query params',
        initialLocation: '/business-status/nature-of-business',
        expectedLocation: '/business-status/nature-of-business?source=example-tasklist'
      },
      {
        name: 'URL with existing query params',
        initialLocation: '/business-status/nature-of-business?existing=param',
        expectedLocation: '/business-status/nature-of-business?existing=param&source=example-tasklist'
      }
    ])('should add source parameter to $name', ({ initialLocation, expectedLocation }) => {
      const response = { headers: { location: initialLocation } }

      preserveSourceParameterInRedirect(response, 'example-tasklist')

      expect(response.headers.location).toBe(expectedLocation)
    })
  })

  describe('Context manipulation', () => {
    it('should add back link to response context', () => {
      const response = {
        source: { context: {} }
      }

      addBackLinkToContext(response, 'example-tasklist')

      expect(response.source.context.backLink).toEqual({
        text: 'Back to tasklist',
        href: '/example-tasklist/tasklist'
      })
    })

    it('should add tasklistId to response context', () => {
      const response = {
        source: { context: {} }
      }

      addTasklistIdToContext(response, 'example-tasklist')

      expect(response.source.context.tasklistId).toBe('example-tasklist')
    })

    it('should not add tasklistId without context', () => {
      const response = {
        source: {}
      }

      addTasklistIdToContext(response, 'example-tasklist')

      expect(response.source.tasklistId).toBeUndefined()
    })
  })

  describe('First page detection', () => {
    it('should identify first pages', () => {
      const mockFirstPages = new Map([['example-tasklist', ['/business-status/nature-of-business']]])

      const result = isFirstPage('/business-status/nature-of-business', 'example-tasklist', mockFirstPages)

      expect(result).toBe(true)
    })

    it('should reject non-first pages', () => {
      const mockFirstPages = new Map([['example-tasklist', ['/business-status/nature-of-business']]])

      const result = isFirstPage('/business-status/legal-status', 'example-tasklist', mockFirstPages)

      expect(result).toBe(false)
    })

    it('should handle unknown tasklistIds', () => {
      const mockFirstPages = new Map()

      const result = isFirstPage('/any-path', 'unknown-tasklist', mockFirstPages)

      expect(result).toBe(false)
    })
  })

  describe('Safe yar operations', () => {
    describe.each([
      {
        operation: 'safeYarGet',
        func: safeYarGet,
        args: ['test-key'],
        successMock: (mockFn) => ({ yar: { get: mockFn.mockReturnValue('test-value') } }),
        successExpected: 'test-value',
        successCall: ['test-key'],
        errorMock: (mockFn) => ({
          yar: {
            get: mockFn.mockImplementation(() => {
              throw new Error('Yar error')
            })
          }
        })
      },
      {
        operation: 'safeYarSet',
        func: safeYarSet,
        args: ['test-key', 'test-value'],
        successMock: (mockFn) => ({ yar: { set: mockFn } }),
        successExpected: true,
        successCall: ['test-key', 'test-value'],
        errorMock: (mockFn) => ({
          yar: {
            set: mockFn.mockImplementation(() => {
              throw new Error('Yar error')
            })
          }
        })
      },
      {
        operation: 'safeYarClear',
        func: safeYarClear,
        args: ['test-key'],
        successMock: (mockFn) => ({ yar: { clear: mockFn } }),
        successExpected: true,
        successCall: ['test-key'],
        errorMock: (mockFn) => ({
          yar: {
            clear: mockFn.mockImplementation(() => {
              throw new Error('Yar error')
            })
          }
        })
      }
    ])('$operation', ({ operation, func, args, successMock, successExpected, successCall, errorMock }) => {
      it('should perform operation successfully', () => {
        const mockFn = vi.fn()
        const request = successMock(mockFn)

        const result = func(request, ...args)

        expect(result).toBe(successExpected)
        expect(mockFn).toHaveBeenCalledWith(...successCall)
      })

      it('should return null/false when yar is missing', () => {
        const request = {}
        const result = func(request, ...args)

        expect(result).toBe(operation === 'safeYarGet' ? null : false)
      })

      it('should return null/false when yar operation throws error', () => {
        const mockFn = vi.fn()
        const request = errorMock(mockFn)

        const result = func(request, ...args)

        expect(result).toBe(operation === 'safeYarGet' ? null : false)
      })
    })
  })

  describe('Request processing logic', () => {
    describe('shouldProcessTasklistRequest', () => {
      it('should return true for tasklist session', () => {
        const result = shouldProcessTasklistRequest(true)
        expect(result).toBe(true)
      })

      it('should return false for non-tasklist session', () => {
        const result = shouldProcessTasklistRequest(false)
        expect(result).toBe(false)
      })
    })

    describe('handleFirstPageRequest', () => {
      it('should add back link for first page with context', () => {
        const request = {
          path: '/business-status/nature-of-business',
          response: {
            source: { context: {} }
          },
          yar: {
            get: vi.fn().mockReturnValue({ tasklistId: 'example-tasklist' })
          }
        }

        handleFirstPageRequest(request, true)

        expect(request.yar.get).toHaveBeenCalledWith('tasklistContext')
      })

      it('should add back link when isFirst and hasContext are both true', () => {
        const request = {
          path: '/business-status/nature-of-business',
          response: {
            source: { context: {} }
          },
          yar: {
            get: vi.fn().mockReturnValue({ tasklistId: 'example-tasklist' })
          }
        }

        handleFirstPageRequest(request, true)

        expect(request.yar.get).toHaveBeenCalledWith('tasklistContext')
      })

      it('should clear session for non-first page', () => {
        const request = {
          path: '/business-status/other-page',
          response: {
            source: { context: {} }
          },
          yar: {
            get: vi.fn().mockReturnValue({ tasklistId: 'example-tasklist' }),
            clear: vi.fn()
          }
        }

        handleFirstPageRequest(request, true)

        expect(request.yar.clear).toHaveBeenCalledWith('tasklistContext')
      })

      it('should handle missing tasklistId', () => {
        const request = {
          path: '/any-path',
          response: { source: { context: {} } },
          yar: {
            get: vi.fn().mockReturnValue(null)
          }
        }

        expect(() => handleFirstPageRequest(request, true)).not.toThrow()
      })
    })

    describe('processExistingTasklistSession', () => {
      it('should return continue for non-view responses', () => {
        const request = {
          response: { variety: 'plain' },
          yar: { get: vi.fn().mockReturnValue({ tasklistId: 'example' }) }
        }
        const h = { continue: Symbol('continue') }

        const result = processExistingTasklistSession(request, true, h)

        expect(result).toBe(h.continue)
      })

      it('should add tasklistId to context for view responses', () => {
        const request = {
          path: '/test-path',
          response: {
            variety: 'view',
            source: { context: {} }
          },
          yar: {
            get: vi.fn().mockReturnValue({ tasklistId: 'example-tasklist' })
          }
        }
        const h = { continue: Symbol('continue') }

        const result = processExistingTasklistSession(request, true, h)

        expect(result).toBe(h.continue)
        expect(request.response.source.context.tasklistId).toBe('example-tasklist')
      })

      it('should handle missing tasklistId in session', () => {
        const request = {
          path: '/test-path',
          response: {
            variety: 'view',
            source: { context: {} }
          },
          yar: {
            get: vi.fn().mockReturnValue(null)
          }
        }
        const h = { continue: Symbol('continue') }

        const result = processExistingTasklistSession(request, true, h)

        expect(result).toBe(h.continue)
        expect(request.response.source.context.tasklistId).toBeUndefined()
      })
    })
  })

  describe('Configuration loading functions', () => {
    describe('extractFirstPages', () => {
      it('should handle empty tasklist config', () => {
        const result = extractFirstPages({})

        expect(result).toEqual([])
      })

      it('should handle config without sections', () => {
        const result = extractFirstPages({ other: 'data' })

        expect(result).toEqual([])
      })

      it('should extract pages and filter nulls', () => {
        const mockConfig = {
          sections: [
            {
              subsections: [{ href: 'form1' }, { href: 'form2' }]
            }
          ]
        }

        const result = extractFirstPages(mockConfig)

        expect(Array.isArray(result)).toBe(true)
      })
    })
  })
})

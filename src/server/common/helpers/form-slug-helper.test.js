import { vi } from 'vitest'
import { mockHapiRequest } from '~/src/__mocks__'
import { storeSlugInContext, getFormSlug, getConfirmationPath, getFormMetadataFromPath } from './form-slug-helper.js'
import { log, LogCodes } from './logging/log.js'
import { getFormsCache } from '~/src/server/common/forms/services/form.js'

vi.mock('./logging/log.js', async () => {
  const { mockLogHelper } = await import('~/src/__mocks__')
  return mockLogHelper()
})

vi.mock('~/src/server/common/forms/services/form.js', () => ({
  getFormsCache: vi.fn(() => [])
}))

describe('form-slug-helper', () => {
  describe('storeSlugInContext', () => {
    const controllerName = 'TestController'

    afterEach(() => {
      vi.clearAllMocks()
    })

    test('should store slug in context when available in request.params', () => {
      const mockSlug = 'test-slug'
      const mockRequest = mockHapiRequest({
        params: { slug: mockSlug }
      })
      const mockContext = { state: {} }

      const result = storeSlugInContext(mockRequest, mockContext, controllerName)

      expect(result).toBe(mockSlug)
      expect(mockContext.state.formSlug).toBe(mockSlug)
      expect(log).toHaveBeenCalledWith(
        LogCodes.FORMS.SLUG_STORED,
        { controller: controllerName, slug: mockSlug },
        mockRequest
      )
    })

    test('should not store slug in context when already present', () => {
      const existingSlug = 'existing-slug'
      const newSlug = 'new-slug'
      const mockRequest = mockHapiRequest({
        params: { slug: newSlug }
      })
      const mockContext = { state: { formSlug: existingSlug } }

      const result = storeSlugInContext(mockRequest, mockContext, controllerName)

      expect(result).toBeNull()
      expect(mockContext.state.formSlug).toBe(existingSlug) // Should not change
      expect(log).not.toHaveBeenCalled()
    })

    test('should return null when slug is not available in request.params', () => {
      const mockRequest = mockHapiRequest({
        params: {}
      })
      const mockContext = { state: {} }

      const result = storeSlugInContext(mockRequest, mockContext, controllerName)

      expect(result).toBeNull()
      expect(mockContext.state.formSlug).toBeUndefined()
      expect(log).not.toHaveBeenCalled()
    })

    test('should handle null or undefined request', () => {
      const mockContext = { state: {} }

      const result = storeSlugInContext(null, mockContext, controllerName)

      expect(result).toBeNull()
      expect(mockContext.state.formSlug).toBeUndefined()
    })

    test('should handle case when context.state is undefined', () => {
      const mockSlug = 'test-slug'
      const mockRequest = mockHapiRequest({
        params: { slug: mockSlug }
      })
      const mockContext = {}

      const result = storeSlugInContext(mockRequest, mockContext, controllerName)

      expect(result).toBeNull()
      expect(log).not.toHaveBeenCalled()
    })
  })

  describe('getFormSlug', () => {
    const controllerName = 'TestController'

    afterEach(() => {
      vi.clearAllMocks()
    })

    test('should get slug from request.params when available', () => {
      const mockSlug = 'test-slug'
      const mockRequest = {
        params: { slug: mockSlug }
      }
      const mockContext = { state: {} }

      const result = getFormSlug(mockRequest, mockContext, controllerName)

      expect(result).toBe(mockSlug)
      expect(log).toHaveBeenCalledWith(
        LogCodes.FORMS.SLUG_RESOLVED,
        { controller: controllerName, message: `Using slug: ${mockSlug}` },
        mockRequest
      )
    })

    test('should get slug from context.state when not in request.params', () => {
      const mockSlug = 'context-slug'
      const mockRequest = {
        params: {}
      }
      const mockContext = { state: { formSlug: mockSlug } }

      const result = getFormSlug(mockRequest, mockContext, controllerName)

      expect(result).toBe(mockSlug)
      expect(log).toHaveBeenCalledWith(
        LogCodes.FORMS.SLUG_RESOLVED,
        { controller: controllerName, message: `Using slug from context.state.formSlug: ${mockSlug}` },
        mockRequest
      )
      expect(log).toHaveBeenCalledWith(
        LogCodes.FORMS.SLUG_RESOLVED,
        { controller: controllerName, message: `Using slug: ${mockSlug}` },
        mockRequest
      )
    })

    test('should prioritize request.params over context.state', () => {
      const paramsSlug = 'params-slug'
      const contextSlug = 'context-slug'
      const mockRequest = {
        params: { slug: paramsSlug }
      }
      const mockContext = { state: { formSlug: contextSlug } }

      const result = getFormSlug(mockRequest, mockContext, controllerName)

      expect(result).toBe(paramsSlug)
      expect(log).toHaveBeenCalledWith(
        LogCodes.FORMS.SLUG_RESOLVED,
        { controller: controllerName, message: `Using slug: ${paramsSlug}` },
        mockRequest
      )
    })

    test('should return empty string when no slug is found', () => {
      const mockRequest = {
        params: {}
      }
      const mockContext = { state: {} }

      const result = getFormSlug(mockRequest, mockContext, controllerName)

      expect(result).toBe('')
      expect(log).toHaveBeenCalledWith(
        LogCodes.FORMS.SLUG_RESOLVED,
        { controller: controllerName, message: 'No slug found, using default path' },
        mockRequest
      )
    })

    test('should handle null request or context', () => {
      const result = getFormSlug(null, null, controllerName)

      expect(result).toBe('')
    })
  })

  describe('getConfirmationPath', () => {
    const controllerName = 'TestController'

    afterEach(() => {
      vi.clearAllMocks()
    })

    test('should return correct path with slug', () => {
      const mockSlug = 'test-slug'
      const mockRequest = {
        params: { slug: mockSlug }
      }
      const mockContext = { state: {} }

      const result = getConfirmationPath(mockRequest, mockContext, controllerName)

      expect(result).toBe(`/${mockSlug}/confirmation`)
    })

    test('should return default path when no slug is found', () => {
      const mockRequest = {
        params: {}
      }
      const mockContext = { state: {} }

      const result = getConfirmationPath(mockRequest, mockContext, controllerName)

      expect(result).toBe('/confirmation')
    })
  })

  describe('getFormMetadataFromPath', () => {
    afterEach(() => {
      vi.clearAllMocks()
    })

    test.each([
      { path: '/farm-payments/some-page', expected: 'found' },
      { path: '/farm-payments/nested/deep/page', expected: 'found' },
      { path: '/unknown-form/page', expected: undefined },
      { path: '/', expected: undefined }
    ])('should return $expected for path "$path"', ({ path, expected }) => {
      const mockMetadata = { serviceName: 'Farm Payments Service' }
      getFormsCache.mockReturnValue([{ slug: 'farm-payments', metadata: mockMetadata }])

      const result = getFormMetadataFromPath({ path })

      expect(result).toEqual(expected === 'found' ? mockMetadata : undefined)
    })

    test.each([null, undefined, {}])('should return undefined when request is %s or has no path', (request) => {
      const result = getFormMetadataFromPath(request)

      expect(result).toBeUndefined()
    })
  })
})

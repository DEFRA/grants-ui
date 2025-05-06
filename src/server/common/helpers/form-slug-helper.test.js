import {
  storeSlugInContext,
  getFormSlug,
  getConfirmationPath
} from './form-slug-helper.js'

describe('form-slug-helper', () => {
  describe('storeSlugInContext', () => {
    const controllerName = 'TestController'
    const mockDebug = jest.fn()

    afterEach(() => {
      jest.clearAllMocks()
    })

    test('should store slug in context when available in request.params', () => {
      const mockSlug = 'test-slug'
      const mockRequest = {
        params: { slug: mockSlug },
        logger: { debug: mockDebug }
      }
      const mockContext = { state: {} }

      const result = storeSlugInContext(
        mockRequest,
        mockContext,
        controllerName
      )

      expect(result).toBe(mockSlug)
      expect(mockContext.state.formSlug).toBe(mockSlug)
      expect(mockDebug).toHaveBeenCalledWith(
        `${controllerName}: Storing slug in context:`,
        mockSlug
      )
    })

    test('should not store slug in context when already present', () => {
      const existingSlug = 'existing-slug'
      const newSlug = 'new-slug'
      const mockRequest = {
        params: { slug: newSlug },
        logger: { debug: mockDebug }
      }
      const mockContext = { state: { formSlug: existingSlug } }

      const result = storeSlugInContext(
        mockRequest,
        mockContext,
        controllerName
      )

      expect(result).toBeNull()
      expect(mockContext.state.formSlug).toBe(existingSlug) // Should not change
      expect(mockDebug).not.toHaveBeenCalled()
    })

    test('should return null when slug is not available in request.params', () => {
      const mockRequest = {
        params: {},
        logger: { debug: mockDebug }
      }
      const mockContext = { state: {} }

      const result = storeSlugInContext(
        mockRequest,
        mockContext,
        controllerName
      )

      expect(result).toBeNull()
      expect(mockContext.state.formSlug).toBeUndefined()
      expect(mockDebug).not.toHaveBeenCalled()
    })

    test('should handle null or undefined request', () => {
      const mockContext = { state: {} }

      const result = storeSlugInContext(null, mockContext, controllerName)

      expect(result).toBeNull()
      expect(mockContext.state.formSlug).toBeUndefined()
    })

    test('should handle case when context.state is undefined', () => {
      const mockSlug = 'test-slug'
      const mockRequest = {
        params: { slug: mockSlug },
        logger: { debug: mockDebug }
      }
      const mockContext = {}

      const result = storeSlugInContext(
        mockRequest,
        mockContext,
        controllerName
      )

      expect(result).toBeNull()
      expect(mockDebug).not.toHaveBeenCalled()
    })
  })

  describe('getFormSlug', () => {
    const controllerName = 'TestController'
    const mockDebug = jest.fn()

    afterEach(() => {
      jest.clearAllMocks()
    })

    test('should get slug from request.params when available', () => {
      const mockSlug = 'test-slug'
      const mockRequest = {
        params: { slug: mockSlug },
        logger: { debug: mockDebug }
      }
      const mockContext = { state: {} }

      const result = getFormSlug(mockRequest, mockContext, controllerName)

      expect(result).toBe(mockSlug)
      expect(mockDebug).toHaveBeenCalledWith(
        `${controllerName}: Using slug:`,
        mockSlug
      )
    })

    test('should get slug from context.state when not in request.params', () => {
      const mockSlug = 'context-slug'
      const mockRequest = {
        params: {},
        logger: { debug: mockDebug }
      }
      const mockContext = { state: { formSlug: mockSlug } }

      const result = getFormSlug(mockRequest, mockContext, controllerName)

      expect(result).toBe(mockSlug)
      expect(mockDebug).toHaveBeenCalledWith(
        `${controllerName}: Using slug from context.state.formSlug:`,
        mockSlug
      )
      expect(mockDebug).toHaveBeenCalledWith(
        `${controllerName}: Using slug:`,
        mockSlug
      )
    })

    test('should prioritize request.params over context.state', () => {
      const paramsSlug = 'params-slug'
      const contextSlug = 'context-slug'
      const mockRequest = {
        params: { slug: paramsSlug },
        logger: { debug: mockDebug }
      }
      const mockContext = { state: { formSlug: contextSlug } }

      const result = getFormSlug(mockRequest, mockContext, controllerName)

      expect(result).toBe(paramsSlug)
      expect(mockDebug).toHaveBeenCalledWith(
        `${controllerName}: Using slug:`,
        paramsSlug
      )
      expect(mockDebug).not.toHaveBeenCalledWith(
        `${controllerName}: Using slug from context.state.formSlug:`,
        expect.anything()
      )
    })

    test('should return empty string when no slug is found', () => {
      const mockRequest = {
        params: {},
        logger: { debug: mockDebug }
      }
      const mockContext = { state: {} }

      const result = getFormSlug(mockRequest, mockContext, controllerName)

      expect(result).toBe('')
      expect(mockDebug).toHaveBeenCalledWith(
        `${controllerName}: No slug found, using default path`
      )
    })

    test('should handle null request or context', () => {
      const result = getFormSlug(null, null, controllerName)

      expect(result).toBe('')
    })
  })

  describe('getConfirmationPath', () => {
    const controllerName = 'TestController'

    test('should return correct path with slug', () => {
      const mockSlug = 'test-slug'
      const mockRequest = {
        params: { slug: mockSlug },
        logger: { debug: jest.fn() }
      }
      const mockContext = { state: {} }

      const result = getConfirmationPath(
        mockRequest,
        mockContext,
        controllerName
      )

      expect(result).toBe(`/${mockSlug}/confirmation`)
    })

    test('should return default path when no slug is found', () => {
      const mockRequest = {
        params: {},
        logger: { debug: jest.fn() }
      }
      const mockContext = { state: {} }

      const result = getConfirmationPath(
        mockRequest,
        mockContext,
        controllerName
      )

      expect(result).toBe('/confirmation')
    })
  })
})

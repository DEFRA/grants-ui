import { tasklistBackButton } from './tasklist-back-button.js'

const createMockRequest = (overrides = {}) => ({
  query: {},
  path: '/default-path',
  yar: {
    get: jest.fn().mockReturnValue(null),
    set: jest.fn(),
    clear: jest.fn()
  },
  ...overrides,
  ...(overrides.yar && {
    yar: { ...overrides.yar }
  })
})

const createMockResponse = (type, overrides = {}) => {
  const baseResponses = {
    view: { variety: 'view', source: { context: {} } },
    redirect: {
      isBoom: false,
      variety: 'plain',
      headers: { location: '/default' }
    },
    boom: { isBoom: true, variety: 'plain', headers: { location: '/error' } },
    file: { variety: 'file', source: { filename: 'test.pdf' } },
    plain: { variety: 'plain' }
  }
  return { ...baseResponses[type], ...overrides }
}

const createTasklistContext = (tasklistId = 'example-tasklist') => ({
  fromTasklist: true,
  tasklistId
})

const mockThrowingYarSet = () => {
  throw new Error('Yar error')
}

const mockThrowingYarClear = () => {
  throw new Error('Yar error')
}

const mockThrowingYarGet = () => {
  throw new Error('Yar get error')
}

const mockThrowingFileRead = () => {
  throw new Error('File read error')
}

const createTasklistYaml = (href = 'nonexistent-form') => `
tasklist:
  id: example
  title: Example
  sections:
    - id: section1
      title: Section 1
      subsections:
        - id: subsection1
          title: Subsection 1
          href: ${href}
`

const mockFsModule = (options = {}) => ({
  existsSync: jest.fn().mockReturnValue(options.existsSync ?? false),
  readdirSync: jest.fn().mockReturnValue(options.files ?? []),
  readFileSync: options.readFileSync ?? jest.fn()
})

const mockFormsConfig = (forms = []) => ({
  allForms: forms
})

const redirectTestCases = [
  {
    description: 'preserve source parameter on redirect',
    location: '/business-status/nature-of-business',
    expected: '/business-status/nature-of-business?source=example-tasklist'
  },
  {
    description: 'handle redirects with existing query parameters',
    location: '/business-status/nature-of-business?mock=query',
    expected:
      '/business-status/nature-of-business?mock=query&source=example-tasklist'
  }
]

const getPreHandler = (server) => server.ext.mock.calls[0][1]
const getResponseHandler = (server) => server.ext.mock.calls[1][1]

const executeWithoutError = (fn) => {
  expect(fn).not.toThrow()
}

const createYarClearErrorRequest = (path, tasklistContext) =>
  createMockRequest({
    path,
    yar: {
      get: jest.fn().mockReturnValue(tasklistContext),
      clear: jest.fn().mockImplementation(mockThrowingYarClear)
    },
    response: createMockResponse('view')
  })

const createYarGetErrorRequest = (path) =>
  createMockRequest({
    path,
    yar: {
      get: jest.fn().mockImplementation(mockThrowingYarGet)
    },
    response: createMockResponse('view')
  })

describe('tasklistBackButton plugin', () => {
  let server
  let h

  beforeEach(() => {
    server = {
      ext: jest.fn()
    }

    h = {
      continue: Symbol('continue')
    }
  })

  afterEach(() => {
    jest.clearAllMocks()
    jest.restoreAllMocks()
  })

  describe('plugin registration with mocked modules', () => {
    beforeEach(() => {
      jest.doMock('fs', () => mockFsModule())
      jest.resetModules()
    })

    afterEach(() => {
      jest.dontMock('fs')
      jest.dontMock('../common/forms/services/forms-config.js')
      jest.resetModules()
    })

    const testMissingConfigDirectory = async () => {
      const { tasklistBackButton } = await import('./tasklist-back-button.js')
      await tasklistBackButton.plugin.register(server)
      expect(server.ext).toHaveBeenCalledTimes(2)
    }

    it('should handle missing config directory', async () => {
      await expect(testMissingConfigDirectory()).resolves.not.toThrow()
    })

    const setupMissingFormConfigMocks = () => {
      jest.doMock('fs', () =>
        mockFsModule({
          existsSync: true,
          files: ['example-tasklist.yaml'],
          readFileSync: jest.fn().mockReturnValueOnce(createTasklistYaml())
        })
      )
      jest.doMock('../common/forms/services/forms-config.js', () =>
        mockFormsConfig([])
      )
    }

    const testMissingFormConfig = async () => {
      const { tasklistBackButton } = await import('./tasklist-back-button.js')
      await tasklistBackButton.plugin.register(server)
    }

    it('should handle missing form config', async () => {
      setupMissingFormConfigMocks()
      await expect(testMissingFormConfig()).resolves.not.toThrow()
    })

    const setupFileReadErrorMocks = () => {
      const readFileImpl = jest
        .fn()
        .mockImplementationOnce(() => createTasklistYaml('business-status'))
        .mockImplementationOnce(mockThrowingFileRead)

      jest.doMock('fs', () =>
        mockFsModule({
          existsSync: true,
          files: ['example-tasklist.yaml'],
          readFileSync: readFileImpl
        })
      )

      jest.doMock('../common/forms/services/forms-config.js', () =>
        mockFormsConfig([
          {
            slug: 'business-status',
            path: 'test-path.yaml'
          }
        ])
      )
    }

    const testFileReadErrors = async () => {
      const { tasklistBackButton } = await import('./tasklist-back-button.js')
      await tasklistBackButton.plugin.register(server)
    }

    it('should handle file read errors', async () => {
      setupFileReadErrorMocks()
      await expect(testFileReadErrors()).resolves.not.toThrow()
    })
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

    it('should register onPreHandler and onPreResponse extensions', async () => {
      await tasklistBackButton.plugin.register(server)
      expect(server.ext).toHaveBeenCalledWith(
        'onPreHandler',
        expect.any(Function)
      )
      expect(server.ext).toHaveBeenCalledWith(
        'onPreResponse',
        expect.any(Function)
      )
      expect(server.ext).toHaveBeenCalledTimes(2)
    })
  })

  describe('onPreHandler hook', () => {
    let preHandler

    beforeEach(async () => {
      await tasklistBackButton.plugin.register(server)
      preHandler = getPreHandler(server)
    })

    it('should set session context when source parameter is present', () => {
      const request = createMockRequest({
        query: { source: 'example-tasklist' },
        path: '/business-status'
      })

      const result = preHandler(request, h)

      expect(request.yar.set).toHaveBeenCalledWith(
        'tasklistContext',
        createTasklistContext('example-tasklist')
      )
      expect(result).toBe(h.continue)
    })

    it('should continue without setting context when missing yar', () => {
      const request = {
        query: { source: 'example-tasklist' },
        path: '/business-status'
      }

      const result = preHandler(request, h)
      expect(result).toBe(h.continue)
    })

    it('should continue without setting context when no source parameter', () => {
      const request = createMockRequest({ query: {}, path: '/business-status' })

      const result = preHandler(request, h)
      expect(result).toBe(h.continue)
      expect(request.yar.set).not.toHaveBeenCalled()
    })

    it('should handle Yar set errors gracefully', () => {
      const request = createMockRequest({
        query: { source: 'example-tasklist' },
        path: '/business-status',
        yar: {
          set: jest.fn().mockImplementation(mockThrowingYarSet)
        }
      })

      const result = preHandler(request, h)
      expect(result).toBe(h.continue)
    })
  })

  describe('onPreResponse handler', () => {
    let responseHandler

    beforeEach(async () => {
      await tasklistBackButton.plugin.register(server)
      responseHandler = getResponseHandler(server)
    })

    const sourceQuery = { source: 'example-tasklist' }

    const testRedirectCase = (location, expected) => {
      const request = createMockRequest({
        query: sourceQuery,
        path: '/business-status',
        response: createMockResponse('redirect', {
          headers: { location }
        })
      })

      responseHandler(request, h)
      expect(request.response.headers.location).toBe(expected)
    }

    // eslint-disable-next-line jest/expect-expect
    it.each(redirectTestCases)(
      'when source=example-tasklist should $description',
      ({ location, expected }) => testRedirectCase(location, expected)
    )

    it('when source=example-tasklist should continue without modification for non-redirect responses', () => {
      const request = createMockRequest({
        query: sourceQuery,
        path: '/business-status',
        response: createMockResponse('view')
      })

      const result = responseHandler(request, h)

      expect(result).toBe(h.continue)
    })

    it('when source=example-tasklist should add tasklistId to view context', () => {
      const request = createMockRequest({
        query: sourceQuery,
        path: '/business-status',
        response: createMockResponse('view')
      })

      responseHandler(request, h)

      expect(request.response.source.context.tasklistId).toBe(
        'example-tasklist'
      )
    })

    it('when source=example-tasklist should not add tasklistId to view without context', () => {
      const request = createMockRequest({
        query: sourceQuery,
        path: '/business-status',
        response: { variety: 'view', source: {} }
      })

      responseHandler(request, h)

      expect(request.response.source.tasklistId).toBeUndefined()
    })

    const tasklistContext = createTasklistContext()
    const firstPagePath = '/business-status/nature-of-business'
    const nonFirstPagePath = '/business-status/legal-status'

    it('when processing first pages should add back link for first page when tasklistContext exists', () => {
      const request = createMockRequest({
        path: firstPagePath,
        yar: {
          get: jest.fn().mockReturnValue(tasklistContext)
        },
        response: createMockResponse('view')
      })

      responseHandler(request, h)

      expect(request.yar.get).toHaveBeenCalledWith('tasklistContext')
      expect(request.response.source.context.backLink).toEqual({
        text: 'Back to tasklist',
        href: '/example-tasklist/tasklist'
      })
    })

    it('when processing first pages should clear session when navigating away from first page', () => {
      const request = createMockRequest({
        path: nonFirstPagePath,
        yar: {
          get: jest.fn().mockReturnValue(tasklistContext),
          clear: jest.fn()
        },
        response: createMockResponse('view')
      })

      responseHandler(request, h)

      expect(request.yar.clear).toHaveBeenCalledWith('tasklistContext')
      expect(request.response.source.context.backLink).toBeUndefined()
    })

    // eslint-disable-next-line jest/expect-expect
    it('when processing first pages should handle Yar clear errors gracefully', () => {
      const request = createYarClearErrorRequest(
        nonFirstPagePath,
        tasklistContext
      )
      executeWithoutError(() => responseHandler(request, h))
    })

    it('when processing first pages should handle Yar get errors gracefully', () => {
      const request = createYarGetErrorRequest(firstPagePath)
      const result = responseHandler(request, h)
      expect(result).toBe(h.continue)
    })

    it('should preserve source parameter on redirect from session context', () => {
      const request = createMockRequest({
        path: '/business-status',
        yar: {
          get: jest.fn().mockReturnValue(tasklistContext)
        },
        response: createMockResponse('redirect', {
          headers: { location: '/next-page' }
        })
      })

      responseHandler(request, h)

      expect(request.response.headers.location).toBe(
        '/next-page?source=example-tasklist'
      )
    })

    it('should add tasklistId to context from session when processing existing session', () => {
      const request = createMockRequest({
        path: firstPagePath,
        yar: {
          get: jest.fn().mockReturnValue(tasklistContext)
        },
        response: createMockResponse('view')
      })

      responseHandler(request, h)

      expect(request.response.source.context.tasklistId).toBe(
        'example-tasklist'
      )
      expect(request.response.source.context.backLink).toEqual({
        text: 'Back to tasklist',
        href: '/example-tasklist/tasklist'
      })
    })

    const continueCases = [
      {
        description: 'missing tasklistContext',
        mockRequest: () =>
          createMockRequest({
            path: firstPagePath,
            response: createMockResponse('view')
          })
      },
      {
        description: 'missing yar',
        mockRequest: () => ({
          query: {},
          path: firstPagePath,
          response: createMockResponse('view')
        })
      },
      {
        description: 'missing context',
        mockRequest: () =>
          createMockRequest({
            path: firstPagePath,
            yar: {
              get: jest.fn().mockReturnValue(tasklistContext)
            },
            response: { variety: 'view', source: {} }
          })
      }
    ]

    const testContinueCase = (mockRequest) => {
      const request = mockRequest()
      const result = responseHandler(request, h)
      expect(result).toBe(h.continue)
      expect(request.response?.source?.context?.backLink).toBeUndefined()
    }

    // eslint-disable-next-line jest/expect-expect
    it.each(continueCases)(
      'when processing first pages should continue when $description',
      ({ mockRequest }) => testContinueCase(mockRequest)
    )

    it.each([
      {
        description: 'missing response',
        request: createMockRequest({
          path: '/business-status/nature-of-business'
        }),
        expectation: (result) => {
          expect(result).toBe(h.continue)
        }
      },
      {
        description: 'non-view response with tasklistContext',
        request: createMockRequest({
          path: '/business-status/nature-of-business',
          yar: {
            get: jest.fn().mockReturnValue(createTasklistContext())
          },
          response: createMockResponse('plain')
        }),
        expectation: (result) => {
          expect(result).toBe(h.continue)
        }
      },
      {
        description: 'file response with tasklistContext',
        request: createMockRequest({
          path: '/business-status/download',
          yar: {
            get: jest.fn().mockReturnValue(createTasklistContext())
          },
          response: createMockResponse('file')
        }),
        expectation: (result, request) => {
          expect(result).toBe(h.continue)
          expect(request.response.source.context).toBeUndefined()
        }
      },
      {
        description: 'boom response with source',
        request: createMockRequest({
          query: { source: 'example-tasklist' },
          path: '/business-status',
          response: createMockResponse('boom')
        }),
        expectation: (result, request) => {
          expect(request.response.headers.location).toBe('/error')
        }
      }
    ])('edge cases: should handle $description', ({ request, expectation }) =>
      expectation(responseHandler(request, h), request)
    )
  })
})

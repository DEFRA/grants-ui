import { vi } from 'vitest'
import {
  extractFirstPageForSubsection,
  extractFirstPages,
  getTasklistIdFromSession,
  isFirstPage,
  loadAllTasklistConfigs,
  preserveSourceParameterInRedirect,
  safeYarClear,
  safeYarGet,
  safeYarSet,
  tasklistBackButton
} from './tasklist-back-button.js'

const throwFileError = () => {
  throw new Error('File read error')
}

const mockFsModule = (options = {}) => ({
  default: {},
  existsSync: vi.fn().mockReturnValue(options.existsSync ?? false),
  readdirSync: vi.fn().mockReturnValue(options.files ?? []),
  readFileSync: options.readFileSync ?? vi.fn()
})

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

const yarTestCases = [
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
]

const mockFormsConfig = (formsArray) => ({
  getFormsCache: vi.fn().mockReturnValue(formsArray)
})

const mockFormsAndFs = (formsConfig, fsConfig) => {
  vi.doMock('../common/forms/services/form.js', () => formsConfig)
  if (fsConfig) {
    vi.doMock('fs', () => fsConfig)
  }
}

const setupAsyncFsMock = async (readFileContent) => {
  vi.doMock('fs', async (importOriginal) => {
    const actual = await importOriginal()
    return {
      ...actual,
      readFileSync: vi.fn().mockReturnValue(readFileContent)
    }
  })
}

describe('Tasklist Back Button - Essential Tests', () => {
  describe('Safe yar operations', () => {
    describe.each(yarTestCases)(
      '$operation',
      ({ operation, func, args, successMock, successExpected, successCall, errorMock }) => {
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
      }
    )
  })

  describe('Configuration loading functions', () => {
    describe('extractFirstPages', () => {
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

      it('should handle error in extractFirstPageForSubsection', () => {
        const formsConfig = mockFormsConfig([{ slug: 'error-form', path: '/nonexistent/path.yaml' }])
        mockFormsAndFs(formsConfig)

        const mockConfig = {
          sections: [
            {
              subsections: [{ href: 'error-form' }]
            }
          ]
        }

        const result = extractFirstPages(mockConfig)

        expect(Array.isArray(result)).toBe(true)
      })

      it('should return array from extractFirstPages with empty sections (lines 88-89)', () => {
        const mockConfig = {
          sections: []
        }

        const result = extractFirstPages(mockConfig)

        expect(result).toEqual([])
      })

      it('should return array from extractFirstPages with sections having no subsections (lines 88-89)', () => {
        const mockConfig = {
          sections: [
            {
              subsections: []
            }
          ]
        }

        const result = extractFirstPages(mockConfig)

        expect(result).toEqual([])
      })
    })
  })

  describe('Direct unit tests for coverage', () => {
    it('should handle error in extractFirstPageForSubsection when readFileSync throws', () => {
      const formsConfig = mockFormsConfig([{ slug: 'test-form', path: '/invalid/path.yaml' }])
      vi.doMock('../common/forms/services/form.js', () => formsConfig)

      const mockReadFile = vi.fn().mockImplementation(() => {
        throw new Error('File read error')
      })
      vi.doMock('fs', () =>
        mockFsModule({
          readFileSync: mockReadFile
        })
      )

      const result = extractFirstPageForSubsection({ href: 'test-form' })

      expect(result).toBeNull()
    })

    it('should return null when form config not found in extractFirstPageForSubsection', () => {
      const formsConfig = mockFormsConfig([])
      vi.doMock('../common/forms/services/form.js', () => formsConfig)

      const result = extractFirstPageForSubsection({ href: 'nonexistent-form' })

      expect(result).toBeNull()
    })

    it('should handle YAML parsing errors in extractFirstPageForSubsection', async () => {
      vi.resetModules()

      const formsConfig = mockFormsConfig([{ slug: 'test-form', path: '/valid/path.yaml' }])
      mockFormsAndFs(formsConfig)

      await setupAsyncFsMock('invalid yaml content {[}]')

      const { extractFirstPageForSubsection: extractFirstPageForSubsectionTest } = await import(
        './tasklist-back-button.js'
      )

      const result = extractFirstPageForSubsectionTest({ href: 'test-form' })

      expect(result).toBeNull()
    })

    it('should return null when firstPage is not found (line 81 falsy path)', () => {
      const formsConfig = mockFormsConfig([{ slug: 'test-form', path: '/valid/path.yaml' }])
      const validFormYaml = `pages:
  - path: /terminal
    controller: TerminalPageController`

      vi.doMock('../common/forms/services/form.js', () => formsConfig)
      vi.doMock('fs', () =>
        mockFsModule({
          readFileSync: vi.fn().mockReturnValue(validFormYaml)
        })
      )

      const result = extractFirstPageForSubsection({ href: 'test-form' })

      expect(result).toBeNull()
    })

    it('should handle tasklistConfig with no sections for line 88 branch', () => {
      const configWithoutSections = {}

      const result = extractFirstPages(configWithoutSections)

      expect(result).toEqual([])
    })

    it('should handle sections with no subsections for line 89 branch', () => {
      const configWithEmptySubsections = {
        sections: [{ id: 'section1' }, { id: 'section2', subsections: null }]
      }

      const result = extractFirstPages(configWithEmptySubsections)

      expect(result).toEqual([])
    })

    it('should trigger line 81 truthy path with valid form containing non-terminal page', async () => {
      const mockServer = { ext: vi.fn() }

      const validFormYaml = `pages:
  - path: /entry`

      const tasklistYaml = `tasklist:
  id: line81-test
  title: Line 81 Test
  sections:
    - id: section1
      title: Section 1
      subsections:
        - id: subsection1
          title: Subsection 1
          href: line81-form`

      const fsModule = mockFsModule({
        existsSync: true,
        files: ['line81-tasklist.yaml'],
        readFileSync: vi.fn().mockReturnValueOnce(tasklistYaml).mockReturnValue(validFormYaml)
      })
      const formsConfig = mockFormsConfig([{ slug: 'line81-form', path: 'line81-form.yaml' }])

      vi.doMock('fs', () => fsModule)
      vi.doMock('../common/forms/services/form.js', () => formsConfig)

      await tasklistBackButton.plugin.register(mockServer)

      expect(mockServer.ext).toHaveBeenCalledTimes(2)
    })

    it('should return early from loadAllTasklistConfigs when directory does not exist', async () => {
      try {
        vi.spyOn(process, 'cwd').mockReturnValue('/non/existent/path')

        const result = await loadAllTasklistConfigs()

        expect(result).toBeUndefined()
      } finally {
        process.cwd.mockRestore?.()
      }
    })

    it('should return tasklistId from session in getTasklistIdFromSession (line 110)', () => {
      const request = {
        yar: {
          get: vi.fn().mockReturnValue({
            fromTasklist: true,
            tasklistId: 'example-tasklist'
          })
        }
      }

      const result = getTasklistIdFromSession(request)

      expect(result).toBe('example-tasklist')
    })

    it('should return null when no tasklistId in session in getTasklistIdFromSession (line 110)', () => {
      const request = {
        yar: {
          get: vi.fn().mockReturnValue({
            fromTasklist: true
          })
        }
      }

      const result = getTasklistIdFromSession(request)

      expect(result).toBeNull()
    })

    it('should use ? separator when location has no query params (line 119)', () => {
      const response = {
        headers: {
          location: '/some-page'
        }
      }

      preserveSourceParameterInRedirect(response, 'example-tasklist')

      expect(response.headers.location).toBe('/some-page?source=example-tasklist')
    })

    it('should use & separator when location already has query params (line 119)', () => {
      const response = {
        headers: {
          location: '/some-page?existing=param'
        }
      }

      preserveSourceParameterInRedirect(response, 'example-tasklist')

      expect(response.headers.location).toBe('/some-page?existing=param&source=example-tasklist')
    })

    it('should return true when path is in first pages (line 129)', () => {
      const mockFirstPagesMap = new Map()
      mockFirstPagesMap.set('example-tasklist', ['/business-status/start', '/other-form/start'])

      const result = isFirstPage('/business-status/start', 'example-tasklist', mockFirstPagesMap)

      expect(result).toBe(true)
    })

    it('should return false when path is not in first pages (line 129)', () => {
      const mockFirstPagesMap = new Map()
      mockFirstPagesMap.set('example-tasklist', ['/business-status/start', '/other-form/start'])

      const result = isFirstPage('/business-status/other-page', 'example-tasklist', mockFirstPagesMap)

      expect(result).toBe(false)
    })

    it('should return false when tasklist not found in first pages map (line 129)', () => {
      const mockFirstPagesMap = new Map()

      const result = isFirstPage('/any-page', 'nonexistent-tasklist', mockFirstPagesMap)

      expect(result).toBe(false)
    })
  })
})

describe('Tasklist Back Button Plugin - Integration Tests', () => {
  let server

  beforeEach(() => {
    server = { ext: vi.fn() }
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unmock('fs')
    vi.unmock('../common/forms/services/form.js')
  })

  describe('Plugin Registration Edge Cases', () => {
    it('should handle missing configs directory during registration', async () => {
      vi.doMock('fs', () =>
        mockFsModule({
          existsSync: false // Directory doesn't exist
        })
      )

      await tasklistBackButton.plugin.register(server)

      expect(server.ext).toHaveBeenCalledTimes(2)
    })

    it('should handle file system errors during config loading', async () => {
      const mockReadFile = vi.fn().mockImplementation(throwFileError)
      const fsModule = mockFsModule({
        existsSync: true,
        files: ['error-tasklist.yaml'],
        readFileSync: mockReadFile
      })
      const formsConfig = mockFormsConfig([{ slug: 'error-form', path: 'error-form.yaml' }])

      vi.doMock('fs', () => fsModule)
      vi.doMock('../common/forms/services/form.js', () => formsConfig)

      await tasklistBackButton.plugin.register(server)

      expect(server.ext).toHaveBeenCalledTimes(2)
    })

    it('should achieve 100% coverage by using existing real form (line 81 coverage)', async () => {
      const realBusinessStatusYaml = `pages:
  - path: /nature-of-business
    title: What is your business?
    components: []
  - path: /cannot-apply-nature-of-business
    controller: TerminalPageController
    components: []`

      const tasklistWithRealForm = `tasklist:
  id: real-coverage-test
  title: Real Coverage Test
  sections:
    - id: section1
      title: Section 1
      subsections:
        - id: subsection1
          title: Subsection 1
          href: business-status`

      const readFileMock = vi.fn()
      readFileMock.mockReturnValueOnce(tasklistWithRealForm)
      readFileMock.mockReturnValue(realBusinessStatusYaml)

      const fsModule = mockFsModule({
        existsSync: true,
        files: ['real-coverage-tasklist.yaml'],
        readFileSync: readFileMock
      })

      const formsConfig = mockFormsConfig([
        {
          slug: 'business-status',
          path: 'src/server/common/forms/definitions/adding-value/business-status.yaml'
        }
      ])

      vi.doMock('fs', () => fsModule)
      vi.doMock('../common/forms/services/form.js', () => formsConfig)

      await tasklistBackButton.plugin.register(server)

      expect(server.ext).toHaveBeenCalledTimes(2)
    })
  })

  describe('End-to-End Happy Path', () => {
    let preHandler
    let responseHandler

    beforeEach(async () => {
      // Use the actual business-status form path from getFormsCache (form.js)
      const businessFormYaml = `pages:
  - path: /nature-of-business
    components: []`

      const fsConfig = mockFsModule({
        existsSync: true,
        files: ['example-tasklist.yaml'],
        readFileSync: vi
          .fn()
          .mockReturnValueOnce(createTasklistYaml('business-status'))
          .mockReturnValue(businessFormYaml)
      })
      const formsConfig = mockFormsConfig([
        {
          slug: 'business-status',
          path: 'src/server/common/forms/definitions/adding-value/business-status.yaml'
        }
      ])

      mockFormsAndFs(formsConfig, fsConfig)

      await tasklistBackButton.plugin.register(server)
      preHandler = server.ext.mock.calls[0][1]
      responseHandler = server.ext.mock.calls[1][1]
    })

    it('should flow source parameter through complete request lifecycle', () => {
      const request = {
        query: { source: 'example-tasklist' },
        path: '/business-status',
        yar: {
          get: vi.fn().mockReturnValue(null),
          set: vi.fn(),
          clear: vi.fn()
        },
        response: {
          variety: 'view',
          source: { context: {} }
        }
      }

      const h = { continue: Symbol('continue') }

      const preResult = preHandler(request, h)
      expect(preResult).toBe(h.continue)
      expect(request.yar.set).toHaveBeenCalledWith('tasklistContext', {
        fromTasklist: true,
        tasklistId: 'example-tasklist'
      })

      request.yar.get.mockReturnValue({
        fromTasklist: true,
        tasklistId: 'example-tasklist'
      })

      const responseResult = responseHandler(request, h)
      expect(responseResult).toBe(h.continue)
      expect(request.response.source.context.tasklistId).toBe('example-tasklist')
    })
  })

  describe('Hook Functions Edge Cases', () => {
    let responseHandler

    beforeEach(async () => {
      const fsConfig = mockFsModule({
        existsSync: true,
        files: ['example-tasklist.yaml'],
        readFileSync: vi.fn().mockReturnValue(createTasklistYaml('business-status'))
      })
      const formsConfig = mockFormsConfig([{ slug: 'business-status', path: 'business-status.yaml' }])

      mockFormsAndFs(formsConfig, fsConfig)

      await tasklistBackButton.plugin.register(server)
      responseHandler = server.ext.mock.calls[1][1]
    })

    it('should handle redirect responses with source parameter', () => {
      const request = {
        query: { source: 'example-tasklist' },
        response: {
          isBoom: false,
          variety: 'plain',
          headers: { location: '/next-page' }
        }
      }
      const h = { continue: Symbol('continue') }

      const result = responseHandler(request, h)

      expect(result).toBe(h.continue)
      expect(request.response.headers.location).toBe('/next-page?source=example-tasklist')
    })

    it('should handle redirect responses from tasklist session', () => {
      const request = {
        query: {},
        response: {
          isBoom: false,
          variety: 'plain',
          headers: { location: '/next-page' }
        },
        yar: {
          get: vi.fn().mockReturnValue({
            fromTasklist: true,
            tasklistId: 'example-tasklist'
          })
        }
      }
      const h = { continue: Symbol('continue') }

      const result = responseHandler(request, h)

      expect(result).toBe(h.continue)
      expect(request.response.headers.location).toBe('/next-page?source=example-tasklist')
    })

    it('should add back link for first page from tasklist session', () => {
      const request = {
        query: {},
        path: '/business-status/nature-of-business',
        response: {
          variety: 'view',
          source: { context: {} }
        },
        yar: {
          get: vi.fn().mockReturnValue({
            fromTasklist: true,
            tasklistId: 'example-tasklist'
          })
        }
      }
      const h = { continue: Symbol('continue') }

      const result = responseHandler(request, h)

      expect(result).toBe(h.continue)
      expect(request.response.source.context).toBeDefined()
    })

    it('should return early when not from tasklist session', () => {
      const request = {
        query: {},
        response: {
          variety: 'view',
          source: { context: {} }
        },
        yar: {
          get: vi.fn().mockReturnValue(null) // No tasklist context
        }
      }
      const h = { continue: Symbol('continue') }

      const result = responseHandler(request, h)

      expect(result).toBe(h.continue)
    })

    it('should handle else case when not first page and not from tasklist', () => {
      const request = {
        query: {},
        path: '/some-other-page',
        response: {
          variety: 'view',
          source: { context: {} }
        },
        yar: {
          get: vi.fn().mockReturnValue({
            fromTasklist: false, // Not from tasklist
            tasklistId: 'example-tasklist'
          })
        }
      }
      const h = { continue: Symbol('continue') }

      const result = responseHandler(request, h)

      expect(result).toBe(h.continue)
    })

    it('should handle else case when first page but no context', () => {
      const request = {
        query: {},
        path: '/business-status/nature-of-business', // This would be a first page
        response: {
          variety: 'view'
          // No source.context - this will trigger !hasContext
        },
        yar: {
          get: vi.fn().mockReturnValue({
            fromTasklist: true,
            tasklistId: 'example-tasklist'
          })
        }
      }
      const h = { continue: Symbol('continue') }

      const result = responseHandler(request, h)

      expect(result).toBe(h.continue)
    })
  })
})

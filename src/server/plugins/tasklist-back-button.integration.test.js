import { vi } from 'vitest'
import { tasklistBackButton } from './tasklist-back-button.js'

const mockFsModule = (options = {}) => ({
  existsSync: vi.fn().mockReturnValue(options.existsSync ?? false),
  readdirSync: vi.fn().mockReturnValue(options.files ?? []),
  readFileSync: options.readFileSync ?? vi.fn()
})

const mockFormsConfig = (forms = []) => ({
  allForms: forms
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

describe('Tasklist Back Button Plugin - Integration Tests', () => {
  let server

  beforeEach(() => {
    server = { ext: vi.fn() }
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unmock('fs')
    vi.unmock('../common/forms/services/forms-config.js')
  })

  describe('Plugin Registration', () => {
    it.each([
      {
        name: 'successfully when configs exist',
        fsModule: () =>
          mockFsModule({
            existsSync: true,
            files: ['example-tasklist.yaml'],
            readFileSync: vi.fn().mockReturnValue(createTasklistYaml('business-status'))
          }),
        formsConfig: () => mockFormsConfig([{ slug: 'business-status', path: 'test-path.yaml' }]),
        additionalExpectations: (server) => {
          expect(server.ext).toHaveBeenCalledWith('onPreHandler', expect.any(Function))
          expect(server.ext).toHaveBeenCalledWith('onPreResponse', expect.any(Function))
        }
      },
      {
        name: 'missing config directory gracefully',
        fsModule: () => mockFsModule({ existsSync: false }),
        formsConfig: () => mockFormsConfig([]),
        additionalExpectations: () => {}
      },
      {
        name: 'file read errors gracefully',
        fsModule: () =>
          mockFsModule({
            existsSync: true,
            files: ['example-tasklist.yaml'],
            readFileSync: vi.fn().mockImplementation(() => {
              throw new Error('File read error')
            })
          }),
        formsConfig: () => mockFormsConfig([]),
        additionalExpectations: () => {}
      }
    ])('should register $name', async ({ fsModule, formsConfig, additionalExpectations }) => {
      vi.doMock('fs', fsModule)
      vi.doMock('../common/forms/services/forms-config.js', formsConfig)

      await expect(tasklistBackButton.plugin.register(server)).resolves.not.toThrow()
      expect(server.ext).toHaveBeenCalledTimes(2)
      additionalExpectations(server)
    })
  })

  describe('End-to-End Happy Path', () => {
    let preHandler
    let responseHandler

    beforeEach(async () => {
      vi.doMock('fs', () =>
        mockFsModule({
          existsSync: true,
          files: ['example-tasklist.yaml'],
          readFileSync: vi.fn().mockReturnValue(createTasklistYaml('business-status'))
        })
      )
      vi.doMock('../common/forms/services/forms-config.js', () =>
        mockFormsConfig([{ slug: 'business-status', path: 'business-status.yaml' }])
      )

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
    let preHandler
    let responseHandler

    beforeEach(async () => {
      vi.doMock('fs', () =>
        mockFsModule({
          existsSync: true,
          files: ['example-tasklist.yaml'],
          readFileSync: vi.fn().mockReturnValue(createTasklistYaml('business-status'))
        })
      )
      vi.doMock('../common/forms/services/forms-config.js', () =>
        mockFormsConfig([{ slug: 'business-status', path: 'business-status.yaml' }])
      )

      await tasklistBackButton.plugin.register(server)
      preHandler = server.ext.mock.calls[0][1]
      responseHandler = server.ext.mock.calls[1][1]
    })

    it('should handle requests without source parameter in preHandler', () => {
      const request = {
        query: {},
        yar: { set: vi.fn() }
      }
      const h = { continue: Symbol('continue') }

      const result = preHandler(request, h)

      expect(result).toBe(h.continue)
      expect(request.yar.set).not.toHaveBeenCalled()
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

    it('should handle view responses without context', () => {
      const request = {
        query: { source: 'example-tasklist' },
        response: {
          variety: 'view',
          source: {}
        }
      }
      const h = { continue: Symbol('continue') }

      const result = responseHandler(request, h)

      expect(result).toBe(h.continue)
      expect(request.response.source.tasklistId).toBeUndefined()
    })

    it('should handle non-tasklist session requests', () => {
      const request = {
        query: {},
        response: { variety: 'view' },
        yar: {
          get: vi.fn().mockReturnValue({ fromTasklist: false })
        }
      }
      const h = { continue: Symbol('continue') }

      const result = responseHandler(request, h)

      expect(result).toBe(h.continue)
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
  })

  describe('Configuration Loading Edge Cases', () => {
    afterEach(() => {
      vi.clearAllMocks()
      vi.unmock('fs')
      vi.unmock('../common/forms/services/forms-config.js')
    })

    it.each([
      {
        scenario: 'missing config directory',
        fsModule: () => mockFsModule({ existsSync: false }),
        formsConfig: () => mockFormsConfig([])
      },
      {
        scenario: 'form config not found',
        fsModule: () =>
          mockFsModule({
            existsSync: true,
            files: ['test-tasklist.yaml'],
            readFileSync: vi.fn().mockReturnValue(createTasklistYaml('nonexistent-form'))
          }),
        formsConfig: () => mockFormsConfig([])
      },
      {
        scenario: 'file read errors during config loading',
        fsModule: () =>
          mockFsModule({
            existsSync: true,
            files: ['test-tasklist.yaml'],
            readFileSync: vi
              .fn()
              .mockReturnValueOnce(createTasklistYaml('business-status'))
              .mockImplementationOnce(() => {
                throw new Error('File read error')
              })
          }),
        formsConfig: () => mockFormsConfig([{ slug: 'business-status', path: 'business-status.yaml' }])
      }
    ])('should handle $scenario', async ({ fsModule, formsConfig }) => {
      vi.doMock('fs', fsModule)
      vi.doMock('../common/forms/services/forms-config.js', formsConfig)

      await expect(tasklistBackButton.plugin.register(server)).resolves.not.toThrow()
    })
  })
})

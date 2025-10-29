import { vi } from 'vitest'
import { SummaryPageController } from '@defra/forms-engine-plugin/controllers/SummaryPageController.js'
import { existsSync } from 'fs'
import { join } from 'path'
import CheckResponsesPageController from '~/src/server/check-responses/check-responses-page.controller.js'
import { mockSimpleRequest, mockHapiResponseToolkit, mockContext } from '~/src/__mocks__/hapi-mocks.js'

describe('CheckResponsesPageController', () => {
  let controller
  let mockModel
  let mockPageDef

  beforeEach(() => {
    mockModel = {
      basePath: '/test-form'
    }
    mockPageDef = {
      path: '/check-answers',
      title: 'Check your answers'
    }
    controller = new CheckResponsesPageController(mockModel, mockPageDef)
  })

  describe('constructor', () => {
    it('should extend SummaryPageController', () => {
      expect(controller).toBeInstanceOf(SummaryPageController)
    })

    it('should set viewName to check-responses-page', () => {
      expect(controller.viewName).toBe('check-responses-page')
    })
  })

  describe('getSummaryPath', () => {
    it('returns this.path when set', () => {
      controller.path = mockPageDef.path

      const result = controller.getSummaryPath()

      expect(result).toBe('/check-answers')
    })

    it('reflects updates to this.path', () => {
      controller.path = '/check-answers'
      expect(controller.getSummaryPath()).toBe('/check-answers')

      controller.path = '/updated-check-answers'
      expect(controller.getSummaryPath()).toBe('/updated-check-answers')
    })

    it('returns undefined if this.path is not set - plugin will then use fallback /summary', () => {
      expect(controller.getSummaryPath()).toBeUndefined()
    })
  })

  describe('makePostRouteHandler', () => {
    let handler

    beforeEach(async () => {
      handler = controller.makePostRouteHandler()
    })

    it('should return a function', () => {
      expect(typeof handler).toBe('function')
    })

    it('should call getNextPath with context and proceed with correct arguments, returning its result', async () => {
      const request = mockSimpleRequest({ method: 'post', path: '/some-path' })
      const context = mockContext({ payload: { foo: 'bar' } })
      const h = mockHapiResponseToolkit({ redirect: vi.fn() })

      const nextPath = '/test-form/declaration'

      controller.getNextPath = vi.fn().mockReturnValue(nextPath)
      const proceedResult = Symbol('proceed-result')
      controller.proceed = vi.fn().mockReturnValue(proceedResult)

      const result = await handler(request, context, h)

      expect(controller.getNextPath).toHaveBeenCalledTimes(1)
      expect(controller.getNextPath).toHaveBeenCalledWith(context)

      expect(controller.proceed).toHaveBeenCalledTimes(1)
      expect(controller.proceed).toHaveBeenCalledWith(request, h, nextPath)

      expect(result).toBe(proceedResult)
    })

    it('should preserve controller context inside returned handler', async () => {
      // If `this` is lost, spies won't be hit
      const request = mockSimpleRequest()
      const context = mockContext()
      const h = mockHapiResponseToolkit()

      controller.getNextPath = vi.fn().mockReturnValue('/next')
      controller.proceed = vi.fn().mockReturnValue('ok')

      const fn = controller.makePostRouteHandler()
      const ret = await fn(request, context, h)

      expect(controller.proceed).toHaveBeenCalledWith(request, h, '/next')
      expect(ret).toBe('ok')
    })
  })

  describe('integration with SummaryPageController', () => {
    it('should properly set up the controller instance', () => {
      expect(controller).toBeDefined()
      expect(controller.viewName).toBe('check-responses-page')
      expect(controller).toHaveProperty('makePostRouteHandler')
    })

    it('should override getSummaryPath from parent', () => {
      expect(controller.getSummaryPath).toBeDefined()
    })

    it('should override makePostRouteHandler from parent', () => {
      const handler = controller.makePostRouteHandler()
      expect(typeof handler).toBe('function')
      expect(handler.constructor.name).toBe('AsyncFunction')
    })
  })

  describe('view file existence', () => {
    it('should reference a view file that actually exists', () => {
      const viewPath = controller.viewName
      expect(viewPath).toBe('check-responses-page')

      // Check that the view file exists at the expected location
      const absoluteViewPath = join(process.cwd(), 'src/server/check-responses/views', `${viewPath}.html`)
      expect(existsSync(absoluteViewPath)).toBe(true)
    })

    it('should have view file in the feature-based location', () => {
      const featureViewPath = join(process.cwd(), 'src/server/check-responses/views/check-responses-page.html')
      expect(existsSync(featureViewPath)).toBe(true)
    })
  })
})

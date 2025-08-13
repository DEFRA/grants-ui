import { SummaryPageController } from '@defra/forms-engine-plugin/controllers/SummaryPageController.js'
import { existsSync } from 'fs'
import { join } from 'path'
import CheckDetailsPageController from '~/src/server/check-details/check-details.controller.js'

describe('CheckDetailsPageController', () => {
  let controller
  let mockModel
  let mockPageDef

  beforeEach(() => {
    mockModel = {
      basePath: '/test-form'
    }
    mockPageDef = {
      path: '/check-details',
      title: 'Check your details'
    }
    controller = new CheckDetailsPageController(mockModel, mockPageDef)
  })

  describe('constructor', () => {
    it('should extend SummaryPageController', () => {
      expect(controller).toBeInstanceOf(SummaryPageController)
    })

    it('should set viewName to check-details-page', () => {
      expect(controller.viewName).toBe('check-details-page')
    })
  })

  describe('makePostRouteHandler', () => {
    let handler

    beforeEach(() => {
      handler = controller.makePostRouteHandler()
    })

    it('should return a function', () => {
      expect(typeof handler).toBe('function')
    })

    it('should call getNextPath with context and proceed with correct arguments, returning its result', () => {
      const request = { method: 'post', path: '/some-path' }
      const context = { payload: { foo: 'bar' } }
      const h = { redirect: jest.fn() }

      const nextPath = '/test-form/declaration'

      controller.getNextPath = jest.fn().mockReturnValue(nextPath)
      const proceedResult = Symbol('proceed-result')
      controller.proceed = jest.fn().mockReturnValue(proceedResult)

      const result = handler(request, context, h)

      expect(controller.getNextPath).toHaveBeenCalledTimes(1)
      expect(controller.getNextPath).toHaveBeenCalledWith(context)

      expect(controller.proceed).toHaveBeenCalledTimes(1)
      expect(controller.proceed).toHaveBeenCalledWith(request, h, nextPath)

      expect(result).toBe(proceedResult)
    })

    it('should preserve controller context inside returned handler', () => {
      // If `this` is lost, spies won't be hit
      const request = {}
      const context = {}
      const h = {}

      controller.getNextPath = jest.fn().mockReturnValue('/next')
      controller.proceed = jest.fn().mockReturnValue('ok')

      const fn = controller.makePostRouteHandler()
      const ret = fn(request, context, h)

      expect(controller.proceed).toHaveBeenCalledWith(request, h, '/next')
      expect(ret).toBe('ok')
    })
  })

  describe('integration with SummaryPageController', () => {
    it('should properly set up the controller instance', () => {
      expect(controller).toBeDefined()
      expect(controller.viewName).toBe('check-details-page')
      expect(controller).toHaveProperty('makePostRouteHandler')
    })

    it('should override makePostRouteHandler from parent', () => {
      const handler = controller.makePostRouteHandler()
      expect(typeof handler).toBe('function')
      expect(handler.constructor.name).toBe('Function')
    })
  })

  describe('view file existence', () => {
    it('should reference a view file that actually exists', () => {
      const viewPath = controller.viewName
      expect(viewPath).toBe('check-details-page')

      // Check that the view file exists at the expected location
      const absoluteViewPath = join(process.cwd(), 'src/server/check-details/views', `${viewPath}.html`)
      expect(existsSync(absoluteViewPath)).toBe(true)
    })

    it('should have view file in the feature-based location', () => {
      const featureViewPath = join(process.cwd(), 'src/server/check-details/views/check-details-page.html')
      expect(existsSync(featureViewPath)).toBe(true)
    })
  })
})

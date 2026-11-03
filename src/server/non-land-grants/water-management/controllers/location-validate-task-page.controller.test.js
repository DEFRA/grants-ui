import { beforeEach, describe, expect, it, vi } from 'vitest'
import LocationValidateTaskPageController from './location-validate-task-page.controller.js'
import LocationValidateController from './location-validate.controller.js'
import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import TaskListPageController from '~/src/server/task-list/task-list-page.controller.js'

describe('LocationValidateTaskPageController', () => {
  let controller
  let mockModel
  let mockPageDef
  let mockRequest
  let mockContext
  let mockH

  beforeEach(() => {
    mockPageDef = {
      path: '/where-project-located',
      title: 'Where is your project located?',
      section: 'project-details'
    }

    mockModel = {
      def: {
        metadata: {
          tasklist: {
            returnAfterSection: true
          }
        }
      },
      page: {
        def: {
          metadata: {
            tasklist: {
              returnAfterSection: true
            }
          },
          pages: [
            { path: '/where-project-located', section: 'project-details' },
            { path: '/next-task-page', section: 'project-details' },
            { path: '/other-section-page', section: 'other-section' }
          ]
        },
        model: {
          pages: [
            { path: '/where-project-located', section: 'project-details' },
            { path: '/next-task-page', section: 'project-details' },
            { path: '/other-section-page', section: 'other-section' }
          ]
        }
      },
      pages: [
        { path: '/where-project-located', section: 'project-details' },
        { path: '/next-task-page', section: 'project-details' },
        { path: '/other-section-page', section: 'other-section' },
        new TaskListPageController({}, { path: '/task-list' })
      ],
      pageMap: new Map([
        ['/where-project-located', { collection: { fields: [] } }],
        ['/next-task-page', { collection: { fields: [] } }],
        ['/other-section-page', { collection: { fields: [] } }]
      ])
    }
    // Set path for finding
    mockModel.pages[0].path = '/where-project-located'
    mockModel.pages[1].path = '/next-task-page'
    mockModel.pages[2].path = '/other-section-page'
    mockModel.pages[3].path = '/task-list'
    mockModel.page.model.pages.push(mockModel.pages[3])
    mockModel.page.model.pages[3].path = '/task-list'

    // Mock parent methods
    QuestionPageController.prototype.getViewModel = vi.fn().mockReturnValue({
      serviceUrl: '/water-management',
      page: mockModel.page
    })
    QuestionPageController.prototype.proceed = vi.fn().mockResolvedValue('parent-proceed')

    controller = new LocationValidateTaskPageController(mockModel, mockPageDef)
    controller.section = 'project-details'
    controller.model = mockModel
    controller.pageDef = mockPageDef

    mockRequest = {
      query: {},
      payload: {}
    }
    mockContext = {}
    mockH = {}

    vi.clearAllMocks()
  })

  it('should be an instance of LocationValidateController', () => {
    expect(controller).toBeInstanceOf(LocationValidateController)
  })

  describe('getViewModel', () => {
    it('should add back link to task list for the first page of a section', () => {
      const viewModel = controller.getViewModel(mockRequest, mockContext)

      expect(viewModel.backLink).toEqual({
        href: '/water-management/task-list',
        text: 'Back to task list'
      })
    })

    it('should not add back link to task list if returnUrl is present', () => {
      mockRequest.query.returnUrl = '/some-url'
      const viewModel = controller.getViewModel(mockRequest, mockContext)

      // When returnUrl is present, getTaskPageBackLink returns null,
      // and applyTaskPageViewModel doesn't add backLink.
      expect(viewModel.backLink).toBeUndefined()
    })
  })

  describe('proceed', () => {
    it('should redirect to next page in same section', async () => {
      const result = await controller.proceed(mockRequest, mockH, '/next-task-page')

      expect(QuestionPageController.prototype.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/next-task-page')
      expect(result).toBe('parent-proceed')
    })

    it('should redirect to task list if next page is in different section', async () => {
      const result = await controller.proceed(mockRequest, mockH, '/other-section-page')

      expect(QuestionPageController.prototype.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/task-list')
      expect(result).toBe('parent-proceed')
    })

    it('should redirect to task list if next page is not found', async () => {
      const result = await controller.proceed(mockRequest, mockH, '/non-existent-page')

      expect(QuestionPageController.prototype.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/task-list')
      expect(result).toBe('parent-proceed')
    })
  })
})

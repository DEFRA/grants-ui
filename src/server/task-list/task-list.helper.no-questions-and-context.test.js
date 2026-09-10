import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildTaskListData, withTaskContext } from './task-list.helper.js'
import { buildPageMap, makeTaskListPageController } from './task-list.helper.test-helpers.js'

describe('task-list.helper', () => {
  describe('buildTaskListData with showQuestions: false', () => {
    const makeModel = () => ({
      serviceUrl: '/service',
      page: {
        def: {
          pages: [
            { path: '/t1a', section: 's1', components: [{ type: 'TextField', name: 'q1' }] },
            { path: '/t1b', section: 's1', components: [{ type: 'TextField', name: 'q2' }] },
            { path: '/t2a', section: 's2', components: [{ type: 'TextField', name: 'q3' }] }
          ],
          sections: [
            { id: 's1', title: 'Task one' },
            { id: 's2', title: 'Task two' }
          ]
        }
      }
    })

    const makeFormModel = (state = {}) => ({
      pageMap: buildPageMap(makeModel().page.def.pages),
      def: {
        metadata: {
          tasklist: { showQuestions: false }
        },
        pages: makeModel().page.def.pages
      },
      conditions: {},
      makeCondition: () => ({ fn: () => true })
    })

    it('should return a single section with one item per task section', () => {
      const data = buildTaskListData(makeModel(), makeFormModel(), {})
      expect(data).toHaveLength(1)
      expect(data[0].items).toHaveLength(2)
    })

    it('should show notStarted for first task when nothing answered', () => {
      const data = buildTaskListData(makeModel(), makeFormModel(), {})
      expect(data[0].items[0].status.tag.text).toBe('Not started')
      expect(data[0].items[0].href).toBe('/service/t1a')
    })

    it('should show cannotStart for second task when first task not completed and second task not started', () => {
      const data = buildTaskListData(makeModel(), makeFormModel(), {})
      expect(data[0].items[1].status.tag.text).toBe('Cannot start yet')
      expect(data[0].items[1].href).toBeUndefined()
    })

    it('should show cannotContinue for second task when it is inProgress but first task is not completed', () => {
      const state = { q3: 'val3' }
      const data = buildTaskListData(makeModel(), makeFormModel(), state)
      expect(data[0].items[1].status.tag.text).toBe('On hold')
      expect(data[0].items[1].href).toBeUndefined()
    })

    it('should show cannotContinue for second task when it is completed but first task is not completed', () => {
      const state = { q1: 'val1', q3: 'val3' }
      const data = buildTaskListData(makeModel(), makeFormModel(), state)
      expect(data[0].items[1].status.tag.text).toBe('On hold')
      expect(data[0].items[1].href).toBeUndefined()
    })

    it('should show inProgress when some but not all pages in section are completed', () => {
      const state = { q1: 'val1' }
      const data = buildTaskListData(makeModel(), makeFormModel(), state)
      expect(data[0].items[0].status.tag.text).toBe('In progress')
      expect(data[0].items[0].href).toBe('/service/t1b') // last page, so forms-engine-plugin redirects to first unanswered
    })

    it('should show completed when all pages in section are completed', () => {
      const state = { q1: 'val1', q2: 'val2' }
      const data = buildTaskListData(makeModel(), makeFormModel(), state)
      expect(data[0].items[0].status.tag.text).toBe('Completed')
      expect(data[0].items[0].href).toBe('/service/t1a')
    })

    it('should show notStarted for second task when first task is completed', () => {
      const state = { q1: 'val1', q2: 'val2' }
      const data = buildTaskListData(makeModel(), makeFormModel(), state)
      expect(data[0].items[1].status.tag.text).toBe('Not started')
      expect(data[0].items[1].href).toBe('/service/t2a')
    })

    it('should treat a conditionally excluded page as not applicable and ignore it for status', () => {
      const model = {
        serviceUrl: '/service',
        page: {
          def: {
            pages: [
              { path: '/t1a', section: 's1', components: [{ type: 'TextField', name: 'q1' }] },
              {
                path: '/t1b',
                section: 's1',
                condition: 'condFalse',
                components: [{ type: 'TextField', name: 'q2' }]
              },
              { path: '/t2a', section: 's2', components: [{ type: 'TextField', name: 'q3' }] }
            ],
            sections: [
              { id: 's1', title: 'Task one' },
              { id: 's2', title: 'Task two' }
            ]
          }
        }
      }
      const formModel = {
        pageMap: buildPageMap(model.page.def.pages),
        def: { metadata: { tasklist: { showQuestions: false } }, pages: model.page.def.pages },
        conditions: { condFalse: {} },
        makeCondition: () => ({ fn: () => false })
      }
      const state = { q1: 'val1' }
      const data = buildTaskListData(model, formModel, state)
      expect(data[0].items[0].status.tag.text).toBe('Completed')
    })

    it('should show inProgress when conditional page is included and not yet answered', () => {
      const model = {
        serviceUrl: '/service',
        page: {
          def: {
            pages: [
              { path: '/t1a', section: 's1', components: [{ type: 'TextField', name: 'q1' }] },
              {
                path: '/t1b',
                section: 's1',
                condition: 'condTrue',
                components: [{ type: 'TextField', name: 'q2' }]
              }
            ],
            sections: [{ id: 's1', title: 'Task one' }]
          }
        }
      }
      const formModel = {
        pageMap: buildPageMap(model.page.def.pages),
        def: { metadata: { tasklist: { showQuestions: false } }, pages: model.page.def.pages },
        conditions: { condTrue: {} },
        makeCondition: () => ({ fn: () => true })
      }
      const state = { q1: 'val1' }
      const data = buildTaskListData(model, formModel, state)
      expect(data[0].items[0].status.tag.text).toBe('In progress')
    })

    it('should allow second task to start when first task has all applicable pages completed (some excluded)', () => {
      const model = {
        serviceUrl: '/service',
        page: {
          def: {
            pages: [
              { path: '/t1a', section: 's1', components: [{ type: 'TextField', name: 'q1' }] },
              {
                path: '/t1b',
                section: 's1',
                condition: 'condFalse',
                components: [{ type: 'TextField', name: 'q2' }]
              },
              { path: '/t2a', section: 's2', components: [{ type: 'TextField', name: 'q3' }] }
            ],
            sections: [
              { id: 's1', title: 'Task one' },
              { id: 's2', title: 'Task two' }
            ]
          }
        }
      }
      const formModel = {
        pageMap: buildPageMap(model.page.def.pages),
        def: { metadata: { tasklist: { showQuestions: false } }, pages: model.page.def.pages },
        conditions: { condFalse: {} },
        makeCondition: () => ({ fn: () => false })
      }
      const state = { q1: 'val1' }
      const data = buildTaskListData(model, formModel, state)
      expect(data[0].items[1].status.tag.text).toBe('Not started')
    })

    it('should use custom status text from metadata statuses config', () => {
      const model = makeModel()
      const formModel = {
        pageMap: buildPageMap(model.page.def.pages),
        def: {
          metadata: {
            tasklist: {
              showQuestions: false,
              statuses: {
                notStarted: { text: 'To do', classes: 'govuk-tag--blue' }
              }
            }
          },
          pages: model.page.def.pages
        },
        conditions: {},
        makeCondition: () => ({ fn: () => true })
      }
      const data = buildTaskListData(model, formModel, {})
      expect(data[0].items[0].status.tag.text).toBe('To do')
    })
  })

  describe('withTaskContext', () => {
    let BaseClass
    let MixedClass
    let mockModel
    let mockPageDef

    beforeEach(() => {
      vi.clearAllMocks()

      mockModel = {
        pages: [],
        def: { metadata: { tasklist: {} } }
      }

      mockPageDef = { path: '/current', section: 's1' }

      BaseClass = class {
        constructor(model, pageDef) {
          this.model = model
          this.pageDef = pageDef
        }

        getViewModel(_request, _context) {
          return {
            serviceUrl: '/service',
            page: {
              model: mockModel,
              def: { metadata: { tasklist: {} } }
            }
          }
        }

        buildViewModel(_request, _context, _overrides) {
          return {
            serviceUrl: '/service',
            page: {
              model: mockModel,
              def: { metadata: { tasklist: {} } }
            }
          }
        }

        proceed(_request, _h, nextPath) {
          return `proceeded:${nextPath}`
        }
      }

      MixedClass = withTaskContext(BaseClass)
    })

    it('should return a class', () => {
      expect(typeof MixedClass).toBe('function')
    })

    const makeViewModelWithPages = (tasklistMetadata = {}) => ({
      serviceUrl: '/service',
      page: {
        model: mockModel,
        def: {
          pages: [{ path: '/current', section: 's1' }],
          metadata: { tasklist: tasklistMetadata }
        }
      }
    })

    describe('getViewModel', () => {
      it('should add backLink when getTaskPageBackLink returns a value', () => {
        mockModel.pages = [makeTaskListPageController()]

        const viewModelWithPages = makeViewModelWithPages()

        BaseClass.prototype.getViewModel = vi.fn().mockReturnValue(viewModelWithPages)

        const controller = new MixedClass(mockModel, mockPageDef)
        const result = controller.getViewModel({ query: {} }, {})

        expect(result.backLink).toEqual({ href: '/service/task-list', text: 'Back to task list' })
      })

      it('should add backToTaskList when returnAfterSection is false', () => {
        mockModel.pages = [makeTaskListPageController()]

        const viewModelWithPages = makeViewModelWithPages({ returnAfterSection: false })

        BaseClass.prototype.getViewModel = vi.fn().mockReturnValue(viewModelWithPages)

        const controller = new MixedClass(mockModel, mockPageDef)
        const result = controller.getViewModel({ query: {} }, {})

        expect(result.backToTaskList).toEqual({ href: '/service/task-list', text: 'Back to task list' })
      })

      it('should not add backToTaskList when returnAfterSection is true (default)', () => {
        mockModel.pages = [makeTaskListPageController()]

        const viewModelWithPages = makeViewModelWithPages()

        BaseClass.prototype.getViewModel = vi.fn().mockReturnValue(viewModelWithPages)

        const controller = new MixedClass(mockModel, mockPageDef)
        const result = controller.getViewModel({ query: {} }, {})

        expect(result.backToTaskList).toBeUndefined()
      })
    })

    describe('buildViewModel', () => {
      it('should apply task page view model additions via buildViewModel', () => {
        mockModel.pages = [makeTaskListPageController()]

        const viewModelWithPages = makeViewModelWithPages({ returnAfterSection: false })

        BaseClass.prototype.buildViewModel = vi.fn().mockReturnValue(viewModelWithPages)

        const controller = new MixedClass(mockModel, mockPageDef)
        const result = controller.buildViewModel({ query: {} }, {}, {})

        expect(result.backToTaskList).toEqual({ href: '/service/task-list', text: 'Back to task list' })
      })
    })

    describe('proceed', () => {
      it('should redirect to task list when next page is in a different section', () => {
        const otherSection = 's2'
        mockModel.pages = [{ path: '/next-path', section: otherSection }, makeTaskListPageController()]
        mockModel.def.metadata.tasklist.returnAfterSection = true

        const controller = new MixedClass(mockModel, mockPageDef)
        controller.section = 's1'

        const result = controller.proceed({}, {}, '/next-path')
        expect(result).toBe('proceeded:/task-list')
      })

      it('should redirect to task list when there is no next page', () => {
        mockModel.pages = [makeTaskListPageController()]
        mockModel.def.metadata.tasklist.returnAfterSection = true

        const controller = new MixedClass(mockModel, mockPageDef)
        controller.section = 's1'

        const result = controller.proceed({}, {}, undefined)
        expect(result).toBe('proceeded:/task-list')
      })

      it('should proceed normally when next page is in the same section', () => {
        const section = 's1'
        mockModel.pages = [{ path: '/next-path', section }]
        mockModel.def.metadata.tasklist.returnAfterSection = true

        const controller = new MixedClass(mockModel, mockPageDef)
        controller.section = section

        const result = controller.proceed({}, {}, '/next-path')
        expect(result).toBe('proceeded:/next-path')
      })

      it('should proceed normally when next page has no section (e.g. exit page)', () => {
        const section = 's1'
        mockModel.pages = [{ path: '/next-path', section: undefined }]
        mockModel.def.metadata.tasklist.returnAfterSection = true

        const controller = new MixedClass(mockModel, mockPageDef)
        controller.section = section

        const result = controller.proceed({}, {}, '/next-path')
        expect(result).toBe('proceeded:/next-path')
      })

      it('should fall back to default navigation if pageDef has no section', () => {
        mockModel.pages = [{ path: '/next-path' }]
        const controller = new MixedClass(mockModel, { path: '/current' })
        controller.section = undefined

        const result = controller.proceed({}, {}, '/next-path')
        expect(result).toBe('proceeded:/next-path')
      })

      it('should fall back to default navigation when returnAfterSection is false', () => {
        const section = 's1'
        const otherSection = 's2'
        mockModel.pages = [{ path: '/next-path', section: otherSection }]
        mockModel.def.metadata.tasklist.returnAfterSection = false

        const controller = new MixedClass(mockModel, mockPageDef)
        controller.section = section

        const result = controller.proceed({}, {}, '/next-path')
        expect(result).toBe('proceeded:/next-path')
      })
    })
  })
})

import { describe, expect, it } from 'vitest'
import { buildTaskListData, getNextTaskPath, getTaskPageBackLink } from './task-list.helper.js'
import { buildPageMap, makeTaskListPageController } from './task-list.helper.test-helpers.js'

const twoTaskPages = [
  { title: 'Task 1', section: 's1', path: '/t1', components: [{ type: 'TextField', name: 'q1' }] },
  { title: 'Task 2', section: 's1', path: '/t2', components: [{ type: 'TextField', name: 'q2' }] }
]
const oneSection = [{ id: 's1', title: 'Section 1' }]
const conditionalTaskPage = {
  title: 'Conditional Task',
  section: 's1',
  path: '/t2',
  condition: 'cond1',
  components: [{ type: 'TextField', name: 'q2' }]
}
const task3Page = { title: 'Task 3', section: 's1', path: '/t3', components: [{ type: 'TextField', name: 'q3' }] }

describe('task-list.helper', () => {
  describe('buildTaskListData', () => {
    it('should group pages by section and include status', () => {
      const mockModel = {
        serviceUrl: '/service',
        page: {
          def: {
            pages: [...twoTaskPages],
            sections: [...oneSection]
          }
        }
      }
      const formModel = {
        pageMap: buildPageMap(mockModel.page.def.pages),
        def: {
          metadata: {
            tasklist: {
              statuses: {
                completed: { text: 'Done', classes: 'done-class' }
              }
            }
          },
          pages: mockModel.page.def.pages
        }
      }
      const state = { q1: 'val1' }

      const data = buildTaskListData(mockModel, formModel, state)

      expect(data).toHaveLength(1)
      expect(data[0].title).toBe('Section 1')
      expect(data[0].items).toHaveLength(2)
      expect(data[0].items[0].title.text).toBe('Task 1')
      expect(data[0].items[0].status.tag.text).toBe('Done')
      expect(data[0].items[1].status.tag.text).toBe('Not started')
    })

    describe('parcel-actions task entry', () => {
      const makeModels = (showQuestions = true) => {
        const pages = [
          {
            title: 'Select your land parcels',
            section: 'land-actions',
            path: '/select-land-parcel',
            controller: 'MapSelectPageController',
            components: [{ type: 'TextField', name: 'selectedParcelsDisplay' }]
          },
          {
            title: 'Select actions',
            section: 'land-actions',
            path: '/select-actions-for-land-parcel',
            controller: 'SelectActionsPageController',
            components: []
          },
          {
            title: 'Review land parcels and actions',
            path: '/confirm-land-and-actions',
            controller: 'ConfirmLandAndActionsPageController',
            components: []
          }
        ]
        const model = {
          serviceUrl: '/service',
          page: {
            def: {
              pages,
              sections: [{ id: 'land-actions', title: 'Select land and actions' }]
            }
          }
        }
        const formModel = {
          pageMap: buildPageMap(pages),
          def: { metadata: { tasklist: { showQuestions } }, pages },
          conditions: {}
        }

        return { model, formModel }
      }

      it('links to the map when no parcel has saved actions', () => {
        const { model, formModel } = makeModels()

        const data = buildTaskListData(model, formModel, { landParcels: {} })

        expect(data[0].items[0].href).toBe('/service/select-land-parcel')
        expect(data[0].items[0].status.tag.text).toBe('Not started')
      })

      it('links to the map when a parcel has an empty actions object', () => {
        const { model, formModel } = makeModels()
        const state = {
          selectedParcelsDisplay: 'SD1234 5678',
          landParcels: { 'SD1234-5678': { actionsObj: {} } }
        }

        const data = buildTaskListData(model, formModel, state)

        expect(data[0].items[0].href).toBe('/service/select-land-parcel')
        expect(data[0].items[0].status.tag.text).toBe('Not started')
      })

      it('links to the confirmation page when a parcel has saved actions', () => {
        const { model, formModel } = makeModels()
        const state = {
          landParcels: { 'SD1234-5678': { actionsObj: { CSAM3: { description: 'Action' } } } }
        }

        const data = buildTaskListData(model, formModel, state)

        expect(data[0].items[0].href).toBe('/service/confirm-land-and-actions')
        expect(data[0].items[0].status.tag.text).toBe('Completed')
      })

      it.each(['SelectActionsPageController', 'ConfirmLandAndActionsPageController'])(
        'keeps the map path when %s is absent',
        (missingController) => {
          const { model, formModel } = makeModels()
          model.page.def.pages = model.page.def.pages.filter((page) => page.controller !== missingController)
          formModel.def.pages = model.page.def.pages
          const state = {
            landParcels: { 'SD1234-5678': { actionsObj: { CSAM3: { description: 'Action' } } } }
          }

          const data = buildTaskListData(model, formModel, state)

          expect(data[0].items[0].href).toBe('/service/select-land-parcel')
        }
      )

      it('uses the same state-aware destination when task questions are hidden', () => {
        const { model, formModel } = makeModels(false)
        const state = {
          landParcels: { 'SD1234-5678': { actionsObj: { CSAM3: { description: 'Action' } } } }
        }

        const data = buildTaskListData(model, formModel, state)

        expect(data[0].items[0].href).toBe('/service/confirm-land-and-actions')
      })
    })

    it('should render plain text without a govuk-tag when a status override has no classes', () => {
      const mockModel = {
        serviceUrl: '/service',
        page: {
          def: {
            pages: [...twoTaskPages],
            sections: [...oneSection]
          }
        }
      }
      const formModel = {
        pageMap: buildPageMap(mockModel.page.def.pages),
        def: {
          metadata: {
            tasklist: {
              statuses: {
                completed: { text: 'Completed' }
              }
            }
          },
          pages: mockModel.page.def.pages
        }
      }
      const state = { q1: 'val1' }

      const data = buildTaskListData(mockModel, formModel, state)

      expect(data[0].items[0].status.text).toBe('Completed')
      expect(data[0].items[0].status.tag).toBeUndefined()
    })

    it('should handle "cannot start yet" status when completeInOrder is true', () => {
      const mockModel = {
        serviceUrl: '/service',
        page: {
          def: {
            pages: [...twoTaskPages],
            sections: [...oneSection]
          }
        }
      }
      const formModel = { def: { metadata: {} }, pageMap: buildPageMap(mockModel.page.def.pages) }
      const state = {}

      const data = buildTaskListData(mockModel, formModel, state)
      expect(data[0].items[1].status.tag.text).toBe('Cannot start yet')
    })

    it('should filter out tasks with unmet conditions', () => {
      const mockModel = {
        serviceUrl: '/service',
        page: {
          def: {
            pages: [twoTaskPages[0], conditionalTaskPage],
            sections: [...oneSection]
          }
        }
      }
      const formModel = {
        pageMap: buildPageMap(mockModel.page.def.pages),
        def: { metadata: {} },
        conditions: {
          cond1: { items: [] }
        },
        makeCondition: () => ({
          fn: () => false
        })
      }
      const state = { q1: 'val1' }

      const data = buildTaskListData(mockModel, formModel, state)

      expect(data).toHaveLength(1)
      expect(data[0].items).toHaveLength(1)
      expect(data[0].items[0].title.text).toBe('Task 1')
    })

    it('should include conditional tasks when conditions are met', () => {
      const mockModel = {
        serviceUrl: '/service',
        page: {
          def: {
            pages: [twoTaskPages[0], conditionalTaskPage],
            sections: [...oneSection]
          }
        }
      }
      const formModel = {
        pageMap: buildPageMap(mockModel.page.def.pages),
        def: { metadata: {} },
        conditions: {
          cond1: { items: [] }
        },
        makeCondition: () => ({
          fn: () => true
        })
      }
      const state = { q1: 'val1', q2: 'val2' }

      const data = buildTaskListData(mockModel, formModel, state)

      expect(data).toHaveLength(1)
      expect(data[0].items).toHaveLength(2)
      expect(data[0].items[1].title.text).toBe('Conditional Task')
    })

    it('should use NationalGridFieldNumberField label as task title', () => {
      const mockModel = {
        serviceUrl: '/service',
        page: {
          def: {
            pages: [
              {
                title: 'Page Title',
                section: 's1',
                path: '/t1',
                components: [{ type: 'NationalGridFieldNumberField', name: 'grid', label: 'Grid reference' }]
              }
            ],
            sections: [{ id: 's1', title: 'Section 1' }]
          }
        }
      }
      const formModel = { def: { metadata: {} }, pageMap: buildPageMap(mockModel.page.def.pages) }
      const state = {}

      const data = buildTaskListData(mockModel, formModel, state)
      expect(data[0].items[0].title.text).toBe('Grid reference')
    })

    describe('getTaskTitle (via buildTaskListData)', () => {
      const makeModel = (components) => ({
        serviceUrl: '/service',
        page: {
          def: {
            pages: [{ title: 'Page Title', section: 's1', path: '/t1', components }],
            sections: [{ id: 's1', title: 'Section 1' }]
          }
        }
      })
      const makeFormModel = (m) => ({ def: { metadata: {} }, pageMap: buildPageMap(m.page.def.pages) })

      it('should use the field label when there is exactly one question component', () => {
        const model = makeModel([{ type: 'TextField', name: 'q1', label: 'Your name' }])
        const data = buildTaskListData(model, makeFormModel(model), {})
        expect(data[0].items[0].title.text).toBe('Your name')
      })

      it('should fall back to pageDef.title when single question component has no label', () => {
        const model = makeModel([{ type: 'TextField', name: 'q1' }])
        const data = buildTaskListData(model, makeFormModel(model), {})
        expect(data[0].items[0].title.text).toBe('Page Title')
      })

      it('should use pageDef.title when there are multiple question components', () => {
        const model = makeModel([
          { type: 'TextField', name: 'q1', label: 'First name' },
          { type: 'TextField', name: 'q2', label: 'Last name' }
        ])
        const data = buildTaskListData(model, makeFormModel(model), { q1: 'a', q2: 'b' })
        expect(data[0].items[0].title.text).toBe('Page Title')
      })

      it('should use pageDef.title when there are no question components', () => {
        // Page with no question components won't appear as a task item (isTaskCompleted returns false)
        // so we verify via a page that has a question alongside the Html component
        const mixedModel = {
          serviceUrl: '/service',
          page: {
            def: {
              pages: [
                {
                  title: 'Mixed Page',
                  section: 's1',
                  path: '/t1',
                  components: [
                    { type: 'Html', name: 'info', content: 'Some content' },
                    { type: 'TextField', name: 'q1', label: 'Your answer' },
                    { type: 'TextField', name: 'q2', label: 'Another answer' }
                  ]
                }
              ],
              sections: [{ id: 's1', title: 'Section 1' }]
            }
          }
        }
        const data = buildTaskListData(mixedModel, makeFormModel(mixedModel), { q1: 'a', q2: 'b' })
        expect(data[0].items[0].title.text).toBe('Mixed Page')
      })

      it('should use pageDef.title when there are multiple question components even if only one has a label', () => {
        const model = makeModel([
          { type: 'RadiosField', name: 'q1', label: 'Your choice' },
          { type: 'TextField', name: 'q2' }
        ])
        const data = buildTaskListData(model, makeFormModel(model), { q1: 'yes', q2: 'text' })
        expect(data[0].items[0].title.text).toBe('Page Title')
      })
    })

    it('should allow starting next task when previous conditional task is not applicable', () => {
      const mockModel = {
        serviceUrl: '/service',
        page: {
          def: {
            pages: [twoTaskPages[0], conditionalTaskPage, task3Page],
            sections: [...oneSection]
          }
        }
      }
      const formModel = {
        pageMap: buildPageMap(mockModel.page.def.pages),
        def: { metadata: {}, pages: mockModel.page.def.pages },
        conditions: {
          cond1: { items: [] }
        },
        makeCondition: () => ({
          fn: () => false
        })
      }
      const state = { q1: 'val1' }

      const data = buildTaskListData(mockModel, formModel, state)

      expect(data).toHaveLength(1)
      expect(data[0].items).toHaveLength(2)
      expect(data[0].items[0].title.text).toBe('Task 1')
      expect(data[0].items[1].title.text).toBe('Task 3')
      expect(data[0].items[1].status.tag.text).toBe('Not started')
    })
  })

  describe('getNextTaskPath', () => {
    const mockModel = {
      pages: [
        { path: '/p1', section: { id: 's1' } },
        { path: '/p2', section: { id: 's1' } },
        { path: '/p3', section: { id: 's2' } },
        makeTaskListPageController()
      ]
    }

    it('should return next page path if in same section', () => {
      expect(getNextTaskPath(mockModel, { path: '/p1', section: 's1' })).toBe('/p2')
    })

    it('should return task list path if no more pages in section', () => {
      expect(getNextTaskPath(mockModel, { path: '/p2', section: 's1' })).toBe('/task-list')
    })
  })

  describe('getTaskPageBackLink', () => {
    const makeViewModel = (overrides = {}) => ({
      serviceUrl: '/service',
      page: {
        def: {
          metadata: {
            tasklist: { returnAfterSection: true, ...overrides }
          },
          pages: [
            { path: '/p1', section: 's1' },
            { path: '/p2', section: 's1' }
          ]
        },
        model: {
          pages: [makeTaskListPageController()]
        }
      }
    })

    it('should return back link to task list for first page in section', () => {
      const backLink = getTaskPageBackLink(makeViewModel(), { path: '/p1', section: 's1' })
      expect(backLink).toEqual({
        href: '/service/task-list',
        text: 'Back to task list'
      })
    })

    it('should return null for subsequent pages in section', () => {
      const backLink = getTaskPageBackLink(makeViewModel(), { path: '/p2', section: 's1' })
      expect(backLink).toBeNull()
    })

    it('should return null if returnAfterSection is false', () => {
      const backLink = getTaskPageBackLink(makeViewModel({ returnAfterSection: false }), {
        path: '/p1',
        section: 's1'
      })
      expect(backLink).toBeNull()
    })

    it('should return null for first page in section when hasReturnUrl is true', () => {
      const backLink = getTaskPageBackLink(makeViewModel(), { path: '/p1', section: 's1' }, true)
      expect(backLink).toBeNull()
    })

    it.each([
      {
        path: '/select-land-parcel',
        section: 'land-actions',
        controller: 'MapSelectPageController'
      },
      {
        path: '/select-actions-for-land-parcel',
        section: 'land-actions',
        controller: 'SelectActionsPageController'
      },
      {
        path: '/confirm-land-and-actions',
        controller: 'ConfirmLandAndActionsPageController'
      }
    ])('returns the task-list back link for parcel-actions page $path', (currentPage) => {
      const viewModel = makeViewModel()
      viewModel.page.def.pages = [
        {
          path: '/select-land-parcel',
          section: 'land-actions',
          controller: 'MapSelectPageController'
        },
        {
          path: '/select-actions-for-land-parcel',
          section: 'land-actions',
          controller: 'SelectActionsPageController'
        },
        {
          path: '/confirm-land-and-actions',
          controller: 'ConfirmLandAndActionsPageController'
        },
        { path: '/declaration', section: 'submit' }
      ]

      const backLink = getTaskPageBackLink(viewModel, currentPage, true)

      expect(backLink).toEqual({
        href: '/service/task-list',
        text: 'Back to task list'
      })
    })
  })
})

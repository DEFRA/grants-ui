import { describe, expect, it } from 'vitest'
import { buildTaskListData, getCompletionStats, getTaskListPath, hasNextTaskPage } from './task-list.helper.js'
import { buildPageMap, makeTaskListPageController } from './task-list.helper.test-helpers.js'

const task1Page = { title: 'Task 1', section: 's1', path: '/t1', components: [{ type: 'YesNoField', name: 'q1' }] }
const task2Page = { title: 'Task 2', section: 's1', path: '/t2', components: [{ type: 'TextField', name: 'q2' }] }
const makeExitPage = (condition) => ({
  title: 'Exit',
  path: '/exit',
  controller: 'TerminalPageController',
  condition,
  components: [{ type: 'Html', name: 'info' }]
})

describe('task-list.helper', () => {
  describe('getTaskListPath', () => {
    it('should return the path of the TaskListPageController', () => {
      const mockModel = {
        pages: [{ path: '/other' }, makeTaskListPageController()]
      }

      expect(getTaskListPath(mockModel)).toBe('/task-list')
    })

    it('should return undefined if no TaskListPageController is found', () => {
      const mockModel = {
        pages: [{ path: '/other' }]
      }
      expect(getTaskListPath(mockModel)).toBeUndefined()
    })
  })

  describe('getCompletionStats', () => {
    it('should calculate completion statistics correctly', () => {
      const mockModel = {
        page: {
          def: {
            pages: [
              { section: 's1', components: [{ type: 'TextField', name: 'q1' }] },
              { section: 's1', components: [{ type: 'TextField', name: 'q2' }] },
              { section: 's2', components: [{ type: 'TextField', name: 'q3' }] },
              { path: '/not-task' }
            ]
          }
        }
      }
      const formModel = { pageMap: buildPageMap(mockModel.page.def.pages) }
      const state = { q1: 'val1', q3: 'val3' }

      const stats = getCompletionStats(mockModel, formModel, state)
      expect(stats).toEqual({
        completed: 2,
        total: 3,
        isComplete: false
      })
    })

    it('should return isComplete true when all tasks are completed', () => {
      const mockModel = {
        page: {
          def: {
            pages: [{ section: 's1', components: [{ type: 'TextField', name: 'q1' }] }]
          }
        }
      }
      const formModel = { pageMap: buildPageMap(mockModel.page.def.pages) }
      const state = { q1: 'val1' }
      expect(getCompletionStats(mockModel, formModel, state).isComplete).toBe(true)
    })

    it('should return 0 completed if no tasks have values', () => {
      const mockModel = {
        page: {
          def: {
            pages: [{ section: 's1', components: [{ type: 'TextField', name: 'q1' }] }]
          }
        }
      }
      const formModel = { pageMap: buildPageMap(mockModel.page.def.pages) }
      const state = {}
      const stats = getCompletionStats(mockModel, formModel, state)
      expect(stats.completed).toBe(0)
    })
  })

  describe('evaluateCondition (via isTaskCompleted / triggersExitPage)', () => {
    it('should hide a conditioned task when formModel is absent', () => {
      const mockModel = {
        page: {
          def: {
            pages: [
              {
                section: 's1',
                condition: 'cond1',
                components: [{ type: 'TextField', name: 'q1' }]
              }
            ]
          }
        }
      }
      const formModel = { pageMap: buildPageMap(mockModel.page.def.pages), conditions: {} }
      const state = { q1: 'value' }
      expect(getCompletionStats(mockModel, formModel, state).completed).toBe(0)
    })

    it('should not trigger an exit page when its condition name is absent from formModel.conditions', () => {
      const mockModel = {
        serviceUrl: '/service',
        page: {
          def: {
            pages: [task1Page, makeExitPage('unknownCond'), task2Page],
            sections: [{ id: 's1', title: 'Section 1' }]
          }
        }
      }
      const formModel = {
        def: { metadata: {}, pages: mockModel.page.def.pages },
        pageMap: buildPageMap(mockModel.page.def.pages),
        conditions: {},
        makeCondition: () => ({ fn: () => true })
      }
      const state = { q1: true }

      const data = buildTaskListData(mockModel, formModel, state)

      expect(data[0].items[1].status.tag.text).toBe('Not started')
    })
  })

  describe('isTaskCompleted', () => {
    it('should handle subfields in state', () => {
      const mockModel = {
        page: {
          def: {
            pages: [{ section: 's1', components: [{ type: 'UkAddressField', name: 'addr' }] }]
          }
        }
      }
      const formModel = { pageMap: buildPageMap(mockModel.page.def.pages) }
      const state = { addr__postcode: 'SW1A 1AA' }
      expect(getCompletionStats(mockModel, formModel, state).completed).toBe(1)
    })

    it('should ignore non-question components', () => {
      const mockModel = {
        page: {
          def: {
            pages: [{ section: 's1', components: [{ type: 'Html', name: 'h1' }] }]
          }
        }
      }
      const formModel = { pageMap: buildPageMap(mockModel.page.def.pages) }
      const state = { h1: 'some html' }
      expect(getCompletionStats(mockModel, formModel, state).completed).toBe(0)
      expect(getCompletionStats(mockModel, formModel, state).total).toBe(1)
    })

    it('should return null for tasks with unmet conditions', () => {
      const mockModel = {
        page: {
          def: {
            pages: [
              {
                section: 's1',
                condition: 'cond1',
                components: [{ type: 'TextField', name: 'q1' }]
              }
            ]
          }
        }
      }
      const formModel = {
        pageMap: buildPageMap(mockModel.page.def.pages),
        conditions: {
          cond1: { items: [] }
        },
        makeCondition: () => ({
          fn: () => false
        })
      }
      const state = {}
      expect(getCompletionStats(mockModel, formModel, state).completed).toBe(0)
      expect(getCompletionStats(mockModel, formModel, state).total).toBe(0)
    })

    it('should count tasks as completed when conditions are met', () => {
      const mockModel = {
        page: {
          def: {
            pages: [
              {
                section: 's1',
                condition: 'cond1',
                components: [{ type: 'TextField', name: 'q1' }]
              }
            ]
          }
        }
      }
      const formModel = {
        pageMap: buildPageMap(mockModel.page.def.pages),
        conditions: {
          cond1: { items: [] }
        },
        makeCondition: () => ({
          fn: () => true
        })
      }
      const state = { q1: 'value' }
      expect(getCompletionStats(mockModel, formModel, state).completed).toBe(1)
    })

    it('should treat NationalGridFieldNumberField as a question component', () => {
      const mockModel = {
        page: {
          def: {
            pages: [{ section: 's1', components: [{ type: 'NationalGridFieldNumberField', name: 'grid' }] }]
          }
        }
      }
      const formModel = { pageMap: buildPageMap(mockModel.page.def.pages) }
      const state = { grid: 'SP123456' }
      expect(getCompletionStats(mockModel, formModel, state).completed).toBe(1)
    })

    it('should treat NationalGridFieldNumberField as incomplete when state is empty', () => {
      const mockModel = {
        page: {
          def: {
            pages: [{ section: 's1', components: [{ type: 'NationalGridFieldNumberField', name: 'grid' }] }]
          }
        }
      }
      const formModel = { pageMap: buildPageMap(mockModel.page.def.pages) }
      const state = {}
      expect(getCompletionStats(mockModel, formModel, state).completed).toBe(0)
    })

    describe('metadata.tasklist.completionRequirements (select land and actions)', () => {
      const mapSelectPage = {
        path: '/select-land-parcel',
        section: 's1',
        controller: 'MapSelectPageController',
        components: [{ type: 'TextField', name: 'selectedParcelsDisplay' }]
      }
      const metadata = {
        tasklist: {
          completionRequirements: {
            '/select-land-parcel': {
              requiresAnyItemWithNonEmptyKey: { collection: 'landParcels', key: 'actionsObj' }
            }
          }
        }
      }

      it('is not completed once a parcel is picked but before any action is saved', () => {
        const mockModel = { page: { def: { pages: [mapSelectPage] } } }
        const formModel = { pageMap: buildPageMap(mockModel.page.def.pages), def: { metadata } }
        const state = { selectedParcelsDisplay: 'SD7148-9160', landParcels: {} }

        expect(getCompletionStats(mockModel, formModel, state).completed).toBe(0)
      })

      it('is not completed when a selected parcel has an entry with no actions', () => {
        const mockModel = { page: { def: { pages: [mapSelectPage] } } }
        const formModel = { pageMap: buildPageMap(mockModel.page.def.pages), def: { metadata } }
        const state = {
          selectedParcelsDisplay: 'SD7148-9160',
          landParcels: { 'SD7148-9160': { actionsObj: {} } }
        }

        expect(getCompletionStats(mockModel, formModel, state).completed).toBe(0)
      })

      it('is completed once the selected parcel has a saved action', () => {
        const mockModel = { page: { def: { pages: [mapSelectPage] } } }
        const formModel = { pageMap: buildPageMap(mockModel.page.def.pages), def: { metadata } }
        const state = {
          selectedParcelsDisplay: 'SD7148-9160',
          landParcels: { 'SD7148-9160': { actionsObj: { CLIG3: { description: 'x', value: 1 } } } }
        }

        expect(getCompletionStats(mockModel, formModel, state).completed).toBe(1)
      })

      it('pages with no configured requirement are unaffected by landParcels/actionsObj', () => {
        const mockModel = {
          page: {
            def: {
              pages: [{ path: '/other', section: 's1', components: [{ type: 'TextField', name: 'q1' }] }]
            }
          }
        }
        const formModel = { pageMap: buildPageMap(mockModel.page.def.pages), def: { metadata: {} } }
        const state = { q1: 'value' }

        expect(getCompletionStats(mockModel, formModel, state).completed).toBe(1)
      })
    })
  })

  describe('exit page blocking', () => {
    it('should block next task when previous task triggers an exit page', () => {
      const mockModel = {
        serviceUrl: '/service',
        page: {
          def: {
            pages: [task1Page, makeExitPage('exitCond'), task2Page],
            sections: [{ id: 's1', title: 'Section 1' }]
          }
        }
      }
      const formModel = {
        pageMap: buildPageMap(mockModel.page.def.pages),
        def: {
          metadata: {},
          pages: mockModel.page.def.pages
        },
        conditions: {
          exitCond: { items: [] }
        },
        makeCondition: () => ({
          fn: () => true
        })
      }
      const state = { q1: false }

      const data = buildTaskListData(mockModel, formModel, state)

      expect(data[0].items).toHaveLength(2)
      expect(data[0].items[0].status.tag.text).toBe('Completed')
      expect(data[0].items[1].status.tag.text).toBe('Cannot start yet')
    })

    it('should not block next task when exit page condition is not triggered', () => {
      const mockModel = {
        serviceUrl: '/service',
        page: {
          def: {
            pages: [task1Page, makeExitPage('exitCond'), task2Page],
            sections: [{ id: 's1', title: 'Section 1' }]
          }
        }
      }
      const formModel = {
        pageMap: buildPageMap(mockModel.page.def.pages),
        def: {
          metadata: {},
          pages: mockModel.page.def.pages
        },
        conditions: {
          exitCond: { items: [] }
        },
        makeCondition: () => ({
          fn: () => false
        })
      }
      const state = { q1: true }

      const data = buildTaskListData(mockModel, formModel, state)

      expect(data[0].items).toHaveLength(2)
      expect(data[0].items[0].status.tag.text).toBe('Completed')
      expect(data[0].items[1].status.tag.text).toBe('Not started')
    })

    it('should show task as completed even when it triggers an exit page', () => {
      const mockModel = {
        serviceUrl: '/service',
        page: {
          def: {
            pages: [task1Page, makeExitPage('exitCond')],
            sections: [{ id: 's1', title: 'Section 1' }]
          }
        }
      }
      const formModel = {
        pageMap: buildPageMap(mockModel.page.def.pages),
        def: {
          metadata: {},
          pages: mockModel.page.def.pages
        },
        conditions: {
          exitCond: { items: [] }
        },
        makeCondition: () => ({
          fn: () => true
        })
      }
      const state = { q1: false }

      const data = buildTaskListData(mockModel, formModel, state)

      expect(data[0].items).toHaveLength(1)
      expect(data[0].items[0].status.tag.text).toBe('Completed')
    })
  })

  describe('hasNextPageInSection', () => {
    const mockModel = {
      page: {
        def: {
          pages: [
            { path: '/p1', section: { id: 's1' } },
            { path: '/p2', section: { id: 's1' } },
            { path: '/p3', section: { id: 's2' } }
          ]
        }
      }
    }

    it('should return true if there is another page in the same section', () => {
      expect(hasNextTaskPage(mockModel, { path: '/p1', section: 's1' })).toBe(true)
    })

    it('should return false if there are no more pages in the same section', () => {
      expect(hasNextTaskPage(mockModel, { path: '/p2', section: 's1' })).toBe(false)
    })
  })
})

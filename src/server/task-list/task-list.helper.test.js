import { describe, expect, it } from 'vitest'
import {
  buildTaskListData,
  getCompletionStats,
  getNextTaskPath,
  getTaskListPath,
  getTaskPageBackLink,
  hasNextPageInSection,
  splitComponents
} from './task-list.helper.js'
import TaskListPageController from './task-list-page.controller.js'

describe('task-list.helper', () => {
  describe('getTaskListPath', () => {
    it('should return the path of the TaskListPageController', () => {
      const mockModel = {
        pages: [{ path: '/other' }, new TaskListPageController({}, { path: '/task-list' })]
      }
      // Note: TaskListPageController constructor sets viewName, but we need to ensure it has a path
      mockModel.pages[1].path = '/task-list'

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
              { path: '/not-task' } // No section
            ]
          }
        }
      }
      const formModel = {}
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
      const formModel = {}
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
      const formModel = {}
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
      const state = { q1: 'value' }
      expect(getCompletionStats(mockModel, undefined, state).completed).toBe(0)
    })

    it('should not trigger an exit page when its condition name is absent from formModel.conditions', () => {
      const mockModel = {
        serviceUrl: '/service',
        page: {
          def: {
            pages: [
              { title: 'Task 1', section: 's1', path: '/t1', components: [{ type: 'YesNoField', name: 'q1' }] },
              {
                title: 'Exit',
                path: '/exit',
                controller: 'TerminalPageController',
                condition: 'unknownCond',
                components: [{ type: 'Html', name: 'info' }]
              },
              { title: 'Task 2', section: 's1', path: '/t2', components: [{ type: 'TextField', name: 'q2' }] }
            ],
            sections: [{ id: 's1', title: 'Section 1' }]
          }
        }
      }
      const formModel = {
        def: { metadata: {}, pages: mockModel.page.def.pages },
        conditions: {}, // 'unknownCond' absent
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
      const formModel = {}
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
      const formModel = {}
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
        conditions: {
          cond1: { items: [] }
        },
        makeCondition: () => ({
          fn: () => false
        })
      }
      const state = {}
      expect(getCompletionStats(mockModel, formModel, state).completed).toBe(0)
      expect(getCompletionStats(mockModel, formModel, state).total).toBe(1)
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
  })

  describe('buildTaskListData', () => {
    it('should group pages by section and include status', () => {
      const mockModel = {
        serviceUrl: '/service',
        page: {
          def: {
            pages: [
              { title: 'Task 1', section: 's1', path: '/t1', components: [{ type: 'TextField', name: 'q1' }] },
              { title: 'Task 2', section: 's1', path: '/t2', components: [{ type: 'TextField', name: 'q2' }] }
            ],
            sections: [{ id: 's1', title: 'Section 1' }]
          }
        }
      }
      const formModel = {
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

    it('should handle "cannot start yet" status when completeInOrder is true', () => {
      const mockModel = {
        serviceUrl: '/service',
        page: {
          def: {
            pages: [
              { title: 'Task 1', section: 's1', path: '/t1', components: [{ type: 'TextField', name: 'q1' }] },
              { title: 'Task 2', section: 's1', path: '/t2', components: [{ type: 'TextField', name: 'q2' }] }
            ],
            sections: [{ id: 's1', title: 'Section 1' }]
          }
        }
      }
      const formModel = { def: { metadata: {} } }
      const state = {} // Nothing completed

      const data = buildTaskListData(mockModel, formModel, state)
      expect(data[0].items[1].status.tag.text).toBe('Cannot start yet')
    })

    it('should filter out tasks with unmet conditions', () => {
      const mockModel = {
        serviceUrl: '/service',
        page: {
          def: {
            pages: [
              { title: 'Task 1', section: 's1', path: '/t1', components: [{ type: 'TextField', name: 'q1' }] },
              {
                title: 'Conditional Task',
                section: 's1',
                path: '/t2',
                condition: 'cond1',
                components: [{ type: 'TextField', name: 'q2' }]
              }
            ],
            sections: [{ id: 's1', title: 'Section 1' }]
          }
        }
      }
      const formModel = {
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
            pages: [
              { title: 'Task 1', section: 's1', path: '/t1', components: [{ type: 'TextField', name: 'q1' }] },
              {
                title: 'Conditional Task',
                section: 's1',
                path: '/t2',
                condition: 'cond1',
                components: [{ type: 'TextField', name: 'q2' }]
              }
            ],
            sections: [{ id: 's1', title: 'Section 1' }]
          }
        }
      }
      const formModel = {
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

    it('should allow starting next task when previous conditional task is not applicable', () => {
      const mockModel = {
        serviceUrl: '/service',
        page: {
          def: {
            pages: [
              { title: 'Task 1', section: 's1', path: '/t1', components: [{ type: 'TextField', name: 'q1' }] },
              {
                title: 'Conditional Task',
                section: 's1',
                path: '/t2',
                condition: 'cond1',
                components: [{ type: 'TextField', name: 'q2' }]
              },
              { title: 'Task 3', section: 's1', path: '/t3', components: [{ type: 'TextField', name: 'q3' }] }
            ],
            sections: [{ id: 's1', title: 'Section 1' }]
          }
        }
      }
      const formModel = {
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

  describe('exit page blocking', () => {
    it('should block next task when previous task triggers an exit page', () => {
      const mockModel = {
        serviceUrl: '/service',
        page: {
          def: {
            pages: [
              { title: 'Task 1', section: 's1', path: '/t1', components: [{ type: 'YesNoField', name: 'q1' }] },
              {
                title: 'Exit',
                path: '/exit',
                controller: 'TerminalPageController',
                condition: 'exitCond',
                components: [{ type: 'Html', name: 'info' }]
              },
              { title: 'Task 2', section: 's1', path: '/t2', components: [{ type: 'TextField', name: 'q2' }] }
            ],
            sections: [{ id: 's1', title: 'Section 1' }]
          }
        }
      }
      const formModel = {
        def: {
          metadata: {},
          pages: mockModel.page.def.pages
        },
        conditions: {
          exitCond: { items: [] }
        },
        makeCondition: () => ({
          fn: () => true // Exit condition is triggered
        })
      }
      const state = { q1: false } // Answered, triggers exit

      const data = buildTaskListData(mockModel, formModel, state)

      expect(data[0].items).toHaveLength(2)
      expect(data[0].items[0].status.tag.text).toBe('Completed') // Task 1 answered
      expect(data[0].items[1].status.tag.text).toBe('Cannot start yet') // Task 2 blocked
    })

    it('should not block next task when exit page condition is not triggered', () => {
      const mockModel = {
        serviceUrl: '/service',
        page: {
          def: {
            pages: [
              { title: 'Task 1', section: 's1', path: '/t1', components: [{ type: 'YesNoField', name: 'q1' }] },
              {
                title: 'Exit',
                path: '/exit',
                controller: 'TerminalPageController',
                condition: 'exitCond',
                components: [{ type: 'Html', name: 'info' }]
              },
              { title: 'Task 2', section: 's1', path: '/t2', components: [{ type: 'TextField', name: 'q2' }] }
            ],
            sections: [{ id: 's1', title: 'Section 1' }]
          }
        }
      }
      const formModel = {
        def: {
          metadata: {},
          pages: mockModel.page.def.pages
        },
        conditions: {
          exitCond: { items: [] }
        },
        makeCondition: () => ({
          fn: () => false // Exit condition NOT triggered
        })
      }
      const state = { q1: true } // Answered correctly

      const data = buildTaskListData(mockModel, formModel, state)

      expect(data[0].items).toHaveLength(2)
      expect(data[0].items[0].status.tag.text).toBe('Completed')
      expect(data[0].items[1].status.tag.text).toBe('Not started') // Not blocked
    })

    it('should show task as completed even when it triggers an exit page', () => {
      const mockModel = {
        serviceUrl: '/service',
        page: {
          def: {
            pages: [
              { title: 'Task 1', section: 's1', path: '/t1', components: [{ type: 'YesNoField', name: 'q1' }] },
              {
                title: 'Exit',
                path: '/exit',
                controller: 'TerminalPageController',
                condition: 'exitCond',
                components: [{ type: 'Html', name: 'info' }]
              }
            ],
            sections: [{ id: 's1', title: 'Section 1' }]
          }
        }
      }
      const formModel = {
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
      expect(data[0].items[0].status.tag.text).toBe('Completed') // Still shows completed
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
      expect(hasNextPageInSection(mockModel, { path: '/p1', section: 's1' })).toBe(true)
    })

    it('should return false if there are no more pages in the same section', () => {
      expect(hasNextPageInSection(mockModel, { path: '/p2', section: 's1' })).toBe(false)
    })
  })

  describe('getNextTaskPath', () => {
    const mockModel = {
      pages: [
        { path: '/p1', section: { id: 's1' } },
        { path: '/p2', section: { id: 's1' } },
        { path: '/p3', section: { id: 's2' } },
        new TaskListPageController({}, { path: '/task-list' })
      ]
    }
    mockModel.pages[3].path = '/task-list'

    it('should return next page path if in same section', () => {
      expect(getNextTaskPath(mockModel, { path: '/p1', section: 's1' })).toBe('/p2')
    })

    it('should return task list path if no more pages in section', () => {
      expect(getNextTaskPath(mockModel, { path: '/p2', section: 's1' })).toBe('/task-list')
    })
  })

  describe('getTaskPageBackLink', () => {
    const viewModel = {
      serviceUrl: '/service',
      page: {
        def: {
          metadata: {
            tasklist: {}
          }
        },
        model: {
          pages: [new TaskListPageController({}, { path: '/task-list' })]
        }
      }
    }
    viewModel.page.model.pages[0].path = '/task-list'

    // Setup pages in def for getTaskPages
    viewModel.page.def.pages = [
      { path: '/p1', section: 's1' },
      { path: '/p2', section: 's1' }
    ]

    it('should return back link to task list for first page in section', () => {
      const backLink = getTaskPageBackLink(viewModel, { path: '/p1', section: 's1' })
      expect(backLink).toEqual({
        href: '/service/task-list',
        text: 'Back to task list'
      })
    })

    it('should return null for subsequent pages in section', () => {
      const backLink = getTaskPageBackLink(viewModel, { path: '/p2', section: 's1' })
      expect(backLink).toBeNull()
    })

    it('should return null if returnAfterSection is false', () => {
      viewModel.page.def.metadata.tasklist.returnAfterSection = false
      const backLink = getTaskPageBackLink(viewModel, { path: '/p1', section: 's1' })
      expect(backLink).toBeNull()
      viewModel.page.def.metadata.tasklist.returnAfterSection = true // reset
    })
  })

  describe('splitComponents', () => {
    it('should split components into above and below arrays', () => {
      const components = [
        {
          type: 'Html',
          content: 'above content',
          options: { position: 'above' },
          isFormComponent: false,
          title: 'Above'
        },
        {
          type: 'Html',
          content: 'below content',
          options: { position: 'below' },
          isFormComponent: false,
          title: 'Below'
        }
      ]
      const [above, below] = splitComponents(components)
      expect(above).toHaveLength(1)
      expect(above[0].model.content).toBe('above content')
      expect(below).toHaveLength(1)
      expect(below[0].model.content).toBe('below content')
    })
  })
})

import { TasklistGenerator } from './tasklist-generator.js'
import { ConfigDrivenConditionEvaluator } from './config-driven-condition-evaluator.js'
import {
  TaskListStatus,
  taskListStatusComponents
} from '../constants/tasklist-status-components.js'
import { createComplexTasklistConfig } from './test-helpers.js'

jest.mock('./config-driven-condition-evaluator.js')

describe('TasklistGenerator', () => {
  let mockConfig
  let generator
  let mockData
  let visitedSubSections

  beforeEach(() => {
    jest.clearAllMocks()

    mockConfig = createComplexTasklistConfig()

    mockData = {
      subsection1: { value: 'completed' }
    }

    visitedSubSections = ['subsection2']

    ConfigDrivenConditionEvaluator.mockImplementation(() => ({
      evaluateCondition: jest
        .fn()
        .mockReturnValue(TaskListStatus.NOT_YET_STARTED),
      checkDependencies: jest.fn().mockReturnValue(true)
    }))

    generator = new TasklistGenerator(mockConfig)
  })

  describe('constructor', () => {
    it('should initialise with config', () => {
      expect(generator.config).toBe(mockConfig)
    })
  })

  describe('generateTasklist', () => {
    it('should generate complete tasklist structure', () => {
      const result = generator.generateTasklist(mockData, visitedSubSections)

      expect(result).toEqual({
        pageHeading: 'Example Tasklist',
        closingDate: '2024-12-31',
        helpText: 'Complete all sections to submit your application',
        sections: expect.any(Array)
      })

      expect(result.sections).toHaveLength(2)
      expect(result.sections[0].title).toBe('Section 1')
      expect(result.sections[0].subsections).toHaveLength(2)
    })

    it('should handle generateTasklist with no parameters', () => {
      const result = generator.generateTasklist()

      expect(result).toEqual({
        pageHeading: 'Example Tasklist',
        closingDate: '2024-12-31',
        helpText: 'Complete all sections to submit your application',
        sections: expect.any(Array)
      })
    })

    it('should handle generateTasklist with undefined data parameter', () => {
      const result = generator.generateTasklist(undefined, ['visited1'])

      expect(result).toEqual({
        pageHeading: 'Example Tasklist',
        closingDate: '2024-12-31',
        helpText: 'Complete all sections to submit your application',
        sections: expect.any(Array)
      })
    })

    it('should handle condition evaluation returning null/undefined values', () => {
      const configWithConditions = {
        tasklist: {
          id: 'test',
          title: 'Test',
          sections: [
            {
              id: 'section1',
              title: 'Section 1',
              subsections: [
                {
                  id: 'subsection1',
                  title: 'Subsection 1',
                  condition: 'testCondition'
                }
              ]
            }
          ],
          conditions: {
            testCondition: {
              type: 'conditional',
              rules: [],
              default: 'not_yet_started'
            }
          }
        }
      }

      const mockEvaluateCondition = jest.fn().mockReturnValueOnce(null)

      ConfigDrivenConditionEvaluator.mockImplementation(() => ({
        evaluateCondition: mockEvaluateCondition
      }))

      const gen = new TasklistGenerator(configWithConditions)

      const result = gen.generateTasklist({}, [])

      expect(result.sections[0].subsections[0].status).toEqual(
        taskListStatusComponents[TaskListStatus.NOT_YET_STARTED]
      )
    })
  })

  describe('determineStatuses', () => {
    it('should determine statuses for all subsections', () => {
      const conditions = new ConfigDrivenConditionEvaluator(
        mockData,
        visitedSubSections
      )
      const statuses = generator.determineStatuses(
        mockData,
        visitedSubSections,
        conditions
      )

      expect(statuses).toHaveProperty('subsection1', TaskListStatus.COMPLETED)
      expect(statuses).toHaveProperty('subsection2', TaskListStatus.IN_PROGRESS)
      expect(statuses).toHaveProperty('subsection3', TaskListStatus.HIDDEN)
    })

    it('should evaluate status rules when present', () => {
      const conditions = new ConfigDrivenConditionEvaluator(
        mockData,
        visitedSubSections
      )
      const statuses = generator.determineStatuses(
        mockData,
        visitedSubSections,
        conditions
      )

      expect(statuses).toHaveProperty('computed1')
      expect(statuses.computed1).toBe(TaskListStatus.CANNOT_START_YET)
    })
  })

  describe('getSubsectionStatus', () => {
    let conditions

    beforeEach(() => {
      conditions = new ConfigDrivenConditionEvaluator(
        mockData,
        visitedSubSections
      )
    })

    it('should return COMPLETED for completed subsections', () => {
      const subsection = { id: 'subsection1', title: 'Test' }
      const status = generator.getSubsectionStatus(
        subsection,
        mockData,
        visitedSubSections,
        conditions,
        {}
      )

      expect(status).toBe(TaskListStatus.COMPLETED)
    })

    it('should return IN_PROGRESS for visited but not completed subsections', () => {
      const subsection = { id: 'subsection2', title: 'Test' }
      const status = generator.getSubsectionStatus(
        subsection,
        mockData,
        visitedSubSections,
        conditions,
        {}
      )

      expect(status).toBe(TaskListStatus.IN_PROGRESS)
    })

    it('should return NOT_YET_STARTED for unvisited subsections', () => {
      const subsection = { id: 'newSubsection', title: 'Test' }
      const status = generator.getSubsectionStatus(
        subsection,
        mockData,
        [],
        conditions,
        {}
      )

      expect(status).toBe(TaskListStatus.NOT_YET_STARTED)
    })

    it('should return HIDDEN for optional subsections', () => {
      const subsection = {
        id: 'newSubsection',
        title: 'Test',
        required: false
      }
      const status = generator.getSubsectionStatus(
        subsection,
        mockData,
        [],
        conditions,
        {}
      )

      expect(status).toBe(TaskListStatus.HIDDEN)
    })

    it('should return CANNOT_START_YET when dependencies not met', () => {
      const subsection = {
        id: 'newSubsection',
        title: 'Test',
        dependsOn: ['notCompleted']
      }
      const currentStatuses = { notCompleted: TaskListStatus.NOT_YET_STARTED }
      const status = generator.getSubsectionStatus(
        subsection,
        mockData,
        [],
        conditions,
        currentStatuses
      )

      expect(status).toBe(TaskListStatus.CANNOT_START_YET)
    })

    it('should evaluate custom conditions when present', () => {
      const subsection = {
        id: 'newSubsection',
        title: 'Test',
        condition: 'testCondition'
      }

      const dataWithTestField = { test: { field: true } }
      const conditionsWithTestField = new ConfigDrivenConditionEvaluator(
        dataWithTestField,
        []
      )

      const status = generator.getSubsectionStatus(
        subsection,
        dataWithTestField,
        [],
        conditionsWithTestField,
        {}
      )

      expect(status).toBe(TaskListStatus.NOT_YET_STARTED)
    })

    it('should handle condition evaluation errors gracefully', () => {
      const subsection = {
        id: 'newSubsection',
        title: 'Test',
        condition: 'nonExistentCondition'
      }

      const status = generator.getSubsectionStatus(
        subsection,
        mockData,
        [],
        conditions,
        {}
      )

      expect(status).toBe(TaskListStatus.NOT_YET_STARTED)
    })

    it('should log warning when condition evaluation throws error', () => {
      const subsection = {
        id: 'errorSubsection',
        title: 'Test',
        condition: 'errorCondition'
      }

      const errorConditions = {
        evaluateCondition: jest.fn().mockImplementation(() => {
          throw new Error('Condition evaluation failed')
        })
      }

      const status = generator.getSubsectionStatus(
        subsection,
        mockData,
        [],
        errorConditions,
        {}
      )

      expect(status).toBe(TaskListStatus.NOT_YET_STARTED)
      expect(errorConditions.evaluateCondition).toHaveBeenCalledWith(
        'errorCondition',
        undefined
      )
    })
  })

  describe('checkDependencies', () => {
    it('should return true when all array dependencies are met', () => {
      const statuses = {
        dep1: TaskListStatus.COMPLETED,
        dep2: TaskListStatus.COMPLETED
      }
      const result = generator.checkDependencies(['dep1', 'dep2'], statuses)
      expect(result).toBe(true)
    })

    it('should return false when array dependencies are not met', () => {
      const statuses = {
        dep1: TaskListStatus.COMPLETED,
        dep2: TaskListStatus.NOT_YET_STARTED
      }
      const result = generator.checkDependencies(['dep1', 'dep2'], statuses)
      expect(result).toBe(false)
    })

    it('should handle allOf dependencies', () => {
      const statuses = {
        dep1: TaskListStatus.COMPLETED,
        dep2: TaskListStatus.HIDDEN
      }
      const dependencies = { allOf: ['dep1', 'dep2'] }
      const result = generator.checkDependencies(dependencies, statuses)
      expect(result).toBe(true)
    })

    it('should handle anyOf dependencies', () => {
      const statuses = {
        dep1: TaskListStatus.COMPLETED,
        dep2: TaskListStatus.NOT_YET_STARTED
      }
      const dependencies = { anyOf: ['dep1', 'dep2'] }
      const result = generator.checkDependencies(dependencies, statuses)
      expect(result).toBe(true)

      const dependencies2 = { anyOf: ['dep3', 'dep4'] }
      const result2 = generator.checkDependencies(dependencies2, statuses)
      expect(result2).toBe(false)
    })

    it('should return true for unknown dependency types', () => {
      const result = generator.checkDependencies({}, {})
      expect(result).toBe(true)
    })

    it('should treat HIDDEN subsections as satisfied dependencies', () => {
      const statuses = {
        dep1: TaskListStatus.COMPLETED,
        dep2: TaskListStatus.HIDDEN,
        dep3: TaskListStatus.HIDDEN
      }

      const arrayResult = generator.checkDependencies(
        ['dep1', 'dep2', 'dep3'],
        statuses
      )
      expect(arrayResult).toBe(true)

      const allOfResult = generator.checkDependencies(
        { allOf: ['dep1', 'dep2', 'dep3'] },
        statuses
      )
      expect(allOfResult).toBe(true)
    })
  })

  describe('evaluateStatusRule', () => {
    it('should return COMPLETED when rule ID exists in data', () => {
      const data = { ruleId: { value: 'test' } }
      const result = generator.evaluateStatusRule('ruleId', {}, {}, data, [])
      expect(result).toBe(TaskListStatus.COMPLETED)
    })

    it('should return IN_PROGRESS when rule ID is visited', () => {
      const result = generator.evaluateStatusRule('ruleId', {}, {}, {}, [
        'ruleId'
      ])
      expect(result).toBe(TaskListStatus.IN_PROGRESS)
    })

    it('should handle allComplete rule type', () => {
      const rule = {
        type: 'allComplete',
        dependsOn: ['dep1', 'dep2']
      }
      const statuses = {
        dep1: TaskListStatus.COMPLETED,
        dep2: TaskListStatus.COMPLETED
      }

      const result = generator.evaluateStatusRule(
        'ruleId',
        rule,
        statuses,
        {},
        []
      )
      expect(result).toBe(TaskListStatus.NOT_YET_STARTED)

      const statusesIncomplete = {
        dep1: TaskListStatus.COMPLETED,
        dep2: TaskListStatus.NOT_YET_STARTED
      }
      const result2 = generator.evaluateStatusRule(
        'ruleId',
        rule,
        statusesIncomplete,
        {},
        []
      )
      expect(result2).toBe(TaskListStatus.CANNOT_START_YET)
    })

    it('should treat HIDDEN subsections as complete for allComplete rule type', () => {
      const rule = {
        type: 'allComplete',
        dependsOn: ['dep1', 'dep2', 'dep3']
      }
      const statuses = {
        dep1: TaskListStatus.COMPLETED,
        dep2: TaskListStatus.HIDDEN,
        dep3: TaskListStatus.HIDDEN
      }

      const result = generator.evaluateStatusRule(
        'ruleId',
        rule,
        statuses,
        {},
        []
      )
      expect(result).toBe(TaskListStatus.NOT_YET_STARTED)
    })

    it('should return CANNOT_START_YET for unknown rule types', () => {
      const rule = { type: 'unknown' }
      const result = generator.evaluateStatusRule('ruleId', rule, {}, {}, [])
      expect(result).toBe(TaskListStatus.CANNOT_START_YET)
    })
  })

  describe('applySectionStatuses', () => {
    it('should apply statuses to section configuration', () => {
      const sections = [
        {
          title: 'Test Section',
          subsections: [
            { id: 'sub1', title: 'Subsection 1', href: '/sub1' },
            { id: 'sub2', title: 'Subsection 2' }
          ]
        }
      ]
      const statuses = {
        sub1: TaskListStatus.COMPLETED,
        sub2: TaskListStatus.NOT_YET_STARTED
      }

      const result = generator.applySectionStatuses(sections, statuses)

      expect(result).toHaveLength(1)
      expect(result[0].title).toBe('Test Section')
      expect(result[0].subsections).toHaveLength(2)
      expect(result[0].subsections[0]).toEqual({
        title: { text: 'Subsection 1' },
        href: '/sub1?source=example-tasklist',
        status: taskListStatusComponents[TaskListStatus.COMPLETED]
      })
      expect(result[0].subsections[1]).toEqual({
        title: { text: 'Subsection 2' },
        href: '/sub2?source=example-tasklist',
        status: taskListStatusComponents[TaskListStatus.NOT_YET_STARTED]
      })
    })

    it('should filter out hidden subsections', () => {
      const sections = [
        {
          title: 'Test Section',
          subsections: [
            { id: 'sub1', title: 'Visible Subsection', href: '/sub1' },
            { id: 'sub2', title: 'Hidden Subsection' },
            { id: 'sub3', title: 'Another Visible' }
          ]
        }
      ]
      const statuses = {
        sub1: TaskListStatus.COMPLETED,
        sub2: TaskListStatus.HIDDEN,
        sub3: TaskListStatus.NOT_YET_STARTED
      }

      const result = generator.applySectionStatuses(sections, statuses)

      expect(result).toHaveLength(1)
      expect(result[0].title).toBe('Test Section')
      expect(result[0].subsections).toHaveLength(2)
      expect(result[0].subsections[0].title.text).toBe('Visible Subsection')
      expect(result[0].subsections[1].title.text).toBe('Another Visible')

      expect(
        result[0].subsections.find((s) => s.title.text === 'Hidden Subsection')
      ).toBeUndefined()
    })
  })

  describe('buildHref', () => {
    it('should build href with source parameter', () => {
      const subsection = { id: 'test', title: 'Test', href: 'test' }
      const statuses = { test: TaskListStatus.COMPLETED }

      const result = generator.buildHref(subsection, statuses)
      expect(result).toBe('/test?source=example-tasklist')
    })

    it('should use subsection id as href when href not specified', () => {
      const subsection = { id: 'test', title: 'Test' }
      const statuses = { test: TaskListStatus.NOT_YET_STARTED }

      const result = generator.buildHref(subsection, statuses)
      expect(result).toBe('/test?source=example-tasklist')
    })

    it('should return null for CANNOT_START_YET status', () => {
      const subsection = { id: 'test', title: 'Test' }
      const statuses = { test: TaskListStatus.CANNOT_START_YET }

      const result = generator.buildHref(subsection, statuses)
      expect(result).toBeNull()
    })

    it('should return null for HIDDEN status', () => {
      const subsection = { id: 'test', title: 'Test' }
      const statuses = { test: TaskListStatus.HIDDEN }

      const result = generator.buildHref(subsection, statuses)
      expect(result).toBeNull()
    })
  })

  describe('integration tests', () => {
    it('should generate complete tasklist with complex dependencies', () => {
      const complexConfig = {
        tasklist: {
          id: 'complex',
          title: 'Complex Tasklist',
          sections: [
            {
              id: 'section1',
              title: 'Prerequisites',
              subsections: [
                { id: 'step1', title: 'Step 1' },
                { id: 'step2', title: 'Step 2', dependsOn: ['step1'] }
              ]
            },
            {
              id: 'section2',
              title: 'Main Tasks',
              subsections: [
                {
                  id: 'step3',
                  title: 'Step 3',
                  dependsOn: { allOf: ['step1', 'step2'] }
                },
                {
                  id: 'step4',
                  title: 'Step 4',
                  dependsOn: { anyOf: ['step2', 'step3'] }
                }
              ]
            }
          ],
          conditions: {}
        }
      }

      const complexData = {
        step1: { completed: true }
      }
      const complexVisited = ['step2']

      const complexGenerator = new TasklistGenerator(complexConfig)
      const result = complexGenerator.generateTasklist(
        complexData,
        complexVisited
      )

      expect(result.sections).toHaveLength(2)

      const step1Status = result.sections[0].subsections[0].status
      const step2Status = result.sections[0].subsections[1].status
      const step3Status = result.sections[1].subsections[0].status
      const step4Status = result.sections[1].subsections[1].status

      expect(step1Status).toEqual(
        taskListStatusComponents[TaskListStatus.COMPLETED]
      )
      expect(step2Status).toEqual(
        taskListStatusComponents[TaskListStatus.IN_PROGRESS]
      )
      expect(step3Status).toEqual(
        taskListStatusComponents[TaskListStatus.CANNOT_START_YET]
      )
      expect(step4Status).toEqual(
        taskListStatusComponents[TaskListStatus.CANNOT_START_YET]
      )
    })
  })
})

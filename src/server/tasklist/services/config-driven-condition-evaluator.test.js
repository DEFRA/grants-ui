import { ConfigDrivenConditionEvaluator } from './config-driven-condition-evaluator.js'
import { TaskListStatus } from '../../common/constants/tasklist-status-components.js'
import { createMockConditionEvaluatorData } from '../helpers/test-helpers.js'

describe('ConfigDrivenConditionEvaluator', () => {
  let evaluator
  let mockData

  beforeEach(() => {
    mockData = createMockConditionEvaluatorData()
    evaluator = new ConfigDrivenConditionEvaluator(mockData, ['section1'])
  })

  describe('constructor', () => {
    describe.each([
      ['null', null],
      ['undefined', undefined]
    ])('should handle %s data parameter', (description, value) => {
      it(`sets data to empty object when ${description}`, () => {
        const evaluator = new ConfigDrivenConditionEvaluator(value, [
          'section1'
        ])
        expect(evaluator.data).toEqual({})
        expect(evaluator.visitedSubSections).toEqual(['section1'])
      })
    })
  })

  describe('evaluateCondition', () => {
    it('should evaluate conditional type conditions', () => {
      const conditionConfig = {
        type: 'conditional',
        rules: [
          {
            if: { field: 'facilities.isBuildingSmallerAbattoir', equals: true },
            then: 'not_yet_started'
          }
        ],
        default: 'cannot_start_yet'
      }

      const result = evaluator.evaluateCondition('test', conditionConfig)
      expect(result).toBe(TaskListStatus.NOT_YET_STARTED)
    })

    it('should throw error for unknown condition type', () => {
      const conditionConfig = { type: 'unknown' }

      expect(() => {
        evaluator.evaluateCondition('test', conditionConfig)
      }).toThrow('Unknown condition type: unknown')
    })

    it('should evaluate dependency type conditions', () => {
      const conditionConfig = {
        type: 'dependency',
        dependsOn: ['facilities'],
        statusMap: {
          true: 'not_yet_started',
          false: 'cannot_start_yet'
        }
      }

      const result = evaluator.evaluateCondition('test', conditionConfig)
      expect(result).toBe(TaskListStatus.NOT_YET_STARTED)
    })

    it('should throw error when condition config not found', () => {
      expect(() => {
        evaluator.evaluateCondition('test', null)
      }).toThrow("Condition 'test' not found in config")
    })
  })

  describe('evaluateConditionalRules', () => {
    it('should return first matching rule result', () => {
      const conditionConfig = {
        type: 'conditional',
        rules: [
          {
            if: {
              field: 'facilities.isBuildingSmallerAbattoir',
              equals: false
            },
            then: 'hidden'
          },
          {
            if: { field: 'facilities.isBuildingSmallerAbattoir', equals: true },
            then: 'not_yet_started'
          }
        ],
        default: 'cannot_start_yet'
      }

      const result = evaluator.evaluateConditionalRules(conditionConfig)
      expect(result).toBe(TaskListStatus.NOT_YET_STARTED)
    })

    it('should return default when no rules match', () => {
      const conditionConfig = {
        type: 'conditional',
        rules: [
          {
            if: { field: 'nonexistent.field', equals: true },
            then: 'not_yet_started'
          }
        ],
        default: 'cannot_start_yet'
      }

      const result = evaluator.evaluateConditionalRules(conditionConfig)
      expect(result).toBe(TaskListStatus.CANNOT_START_YET)
    })

    it('should return CANNOT_START_YET when no default status provided', () => {
      const conditionConfig = {
        type: 'conditional',
        rules: [
          {
            if: { field: 'nonexistent.field', equals: true },
            then: 'not_yet_started'
          }
        ]
      }

      const result = evaluator.evaluateConditionalRules(conditionConfig)
      expect(result).toBe(TaskListStatus.CANNOT_START_YET)
    })
  })

  describe('evaluateDependencyRules', () => {
    beforeEach(() => {
      mockData = {
        completed1: { value: 'test' },
        completed2: { value: 'test' }
      }
      evaluator = new ConfigDrivenConditionEvaluator(mockData)
    })

    it('should handle dependency rules with statusMap', () => {
      const conditionConfig = {
        type: 'dependency',
        dependsOn: ['completed1', 'completed2'],
        statusMap: {
          true: 'not_yet_started',
          false: 'cannot_start_yet',
          default: 'hidden'
        }
      }

      const result = evaluator.evaluateDependencyRules(conditionConfig)
      expect(result).toBe(TaskListStatus.NOT_YET_STARTED)
    })

    it('should handle dependency rules with statusMap and default fallback', () => {
      const conditionConfig = {
        type: 'dependency',
        dependsOn: ['completed1', 'notCompleted'],
        statusMap: {
          true: 'not_yet_started',
          default: 'cannot_start_yet'
        }
      }

      const result = evaluator.evaluateDependencyRules(conditionConfig)
      expect(result).toBe(TaskListStatus.CANNOT_START_YET)
    })

    it('should handle dependency rules without statusMap when dependencies met', () => {
      const conditionConfig = {
        type: 'dependency',
        dependsOn: ['completed1', 'completed2']
      }

      const result = evaluator.evaluateDependencyRules(conditionConfig)
      expect(result).toBe(TaskListStatus.NOT_YET_STARTED)
    })

    it('should handle dependency rules without statusMap when dependencies not met', () => {
      const conditionConfig = {
        type: 'dependency',
        dependsOn: ['completed1', 'notCompleted']
      }

      const result = evaluator.evaluateDependencyRules(conditionConfig)
      expect(result).toBe(TaskListStatus.CANNOT_START_YET)
    })
  })

  describe('evaluateRule', () => {
    describe.each([
      [
        'AND logic',
        {
          and: [
            { field: 'facilities.isBuildingSmallerAbattoir', equals: true },
            {
              field: 'facilities.isProvidingServicesToOtherFarmers',
              equals: true
            }
          ]
        },
        true
      ],
      [
        'OR logic',
        {
          or: [
            { field: 'facilities.isBuildingSmallerAbattoir', equals: false },
            {
              field: 'facilities.isProvidingServicesToOtherFarmers',
              equals: true
            }
          ]
        },
        true
      ],
      [
        'NOT logic',
        {
          not: { field: 'facilities.isBuildingSmallerAbattoir', equals: false }
        },
        true
      ]
    ])('should handle %s', (description, rule, expected) => {
      it(`evaluates ${description} correctly`, () => {
        const result = evaluator.evaluateRule(rule)
        expect(result).toBe(expected)
      })
    })

    it('should return true for empty rule', () => {
      const result = evaluator.evaluateRule(null)
      expect(result).toBe(true)
    })

    it('should return false for rule without recognised operators', () => {
      const rule = {
        unknownOperator: 'value'
      }
      const result = evaluator.evaluateRule(rule)
      expect(result).toBe(false)
    })
  })

  describe('evaluateFieldCondition', () => {
    describe.each([
      ['equals', 'facilities.isBuildingSmallerAbattoir', true, true],
      ['equals', 'facilities.isBuildingSmallerAbattoir', false, false],
      ['notEquals', 'facilities.isBuildingSmallerAbattoir', false, true]
    ])('should handle %s operator', (operator, field, value, expected) => {
      it(`${field} ${operator} ${value} should be ${expected}`, () => {
        const rule = { field, [operator]: value }
        expect(evaluator.evaluateFieldCondition(rule)).toBe(expected)
      })
    })

    describe.each([
      ['facilities.isBuildingSmallerAbattoir', true, true],
      ['nonexistent.field', false, true]
    ])('should handle exists operator', (field, value, expected) => {
      it(`${field} exists=${value} should be ${expected}`, () => {
        const rule = { field, exists: value }
        expect(evaluator.evaluateFieldCondition(rule)).toBe(expected)
      })
    })

    describe.each([
      [
        'who-is-applying.grantApplicantType',
        ['applying-A1', 'applying-A2'],
        true
      ],
      ['who-is-applying.grantApplicantType', ['applying-A3'], false]
    ])('should handle in operator', (field, values, expected) => {
      it(`${field} in ${JSON.stringify(values)} should be ${expected}`, () => {
        const rule = { field, in: values }
        expect(evaluator.evaluateFieldCondition(rule)).toBe(expected)
      })
    })

    describe.each([
      ['who-is-applying.grantApplicantType', ['applying-A3'], true]
    ])('should handle notIn operator', (field, values, expected) => {
      it(`${field} notIn ${JSON.stringify(values)} should be ${expected}`, () => {
        const rule = { field, notIn: values }
        expect(evaluator.evaluateFieldCondition(rule)).toBe(expected)
      })
    })

    describe.each([
      ['gt', 40000, true],
      ['gt', 60000, false],
      ['gte', 50000, true],
      ['gte', 60000, false],
      ['lt', 60000, true],
      ['lt', 40000, false],
      ['lte', 50000, true],
      ['lte', 40000, false]
    ])('should handle %s operator', (operator, value, expected) => {
      it(`${operator} ${value} should be ${expected}`, () => {
        const rule = { field: 'costs.totalCosts', [operator]: value }
        expect(evaluator.evaluateFieldCondition(rule)).toBe(expected)
      })
    })

    describe.each([
      [
        'emptyField',
        true,
        true,
        { emptyField: '', nullField: null, undefinedField: undefined }
      ],
      ['costs.totalCosts', false, true, null]
    ])(
      'should handle isEmpty operator',
      (field, isEmptyValue, expected, customData) => {
        it(`${field} isEmpty=${isEmptyValue} should be ${expected}`, () => {
          const testEvaluator = customData
            ? new ConfigDrivenConditionEvaluator(customData)
            : evaluator
          const rule = { field, isEmpty: isEmptyValue }
          expect(testEvaluator.evaluateFieldCondition(rule)).toBe(expected)
        })
      }
    )

    it('should return false for unknown operators', () => {
      const rule = {
        field: 'facilities.isBuildingSmallerAbattoir',
        unknownOp: true
      }
      expect(evaluator.evaluateFieldCondition(rule)).toBe(false)
    })
  })

  describe('getFieldValue', () => {
    it('should retrieve nested field values', () => {
      const result = evaluator.getFieldValue(
        'facilities.isBuildingSmallerAbattoir'
      )
      expect(result).toBe(true)
    })

    it('should return undefined for non-existent paths', () => {
      const result = evaluator.getFieldValue('nonexistent.path')
      expect(result).toBeUndefined()
    })

    it('should handle single level paths', () => {
      const data = { singleLevel: 'value' }
      const evaluatorSingle = new ConfigDrivenConditionEvaluator(data)
      const result = evaluatorSingle.getFieldValue('singleLevel')
      expect(result).toBe('value')
    })
  })

  describe('checkDependencies', () => {
    beforeEach(() => {
      mockData = {
        completed1: { value: 'test' },
        completed2: { value: 'test' }
      }
      evaluator = new ConfigDrivenConditionEvaluator(mockData)
    })

    it('should handle array of dependencies (all must be completed)', () => {
      const result = evaluator.checkDependencies(['completed1', 'completed2'])
      expect(result).toBe(true)

      const result2 = evaluator.checkDependencies([
        'completed1',
        'notCompleted'
      ])
      expect(result2).toBe(false)
    })

    describe.each([
      ['allOf', { allOf: ['completed1', 'completed2'] }, true],
      ['anyOf', { anyOf: ['completed1', 'notCompleted'] }, true],
      ['anyOf', { anyOf: ['notCompleted1', 'notCompleted2'] }, false],
      ['noneOf', { noneOf: ['notCompleted1', 'notCompleted2'] }, true],
      ['noneOf', { noneOf: ['completed1'] }, false]
    ])('should handle %s dependencies', (type, deps, expected) => {
      it(`${type} with ${JSON.stringify(deps)} should be ${expected}`, () => {
        const result = evaluator.checkDependencies(deps)
        expect(result).toBe(expected)
      })
    })

    describe.each([
      ['unknown dependency object types', { unknownType: ['dependency1'] }],
      ['dependency object without specific type properties', {}],
      ['non-object, non-array dependencies', 'string'],
      ['null dependencies', null]
    ])('should return true for %s', (description, deps) => {
      it(`handles ${description}`, () => {
        const result = evaluator.checkDependencies(deps)
        expect(result).toBe(true)
      })
    })
  })

  describe('normaliseStatus', () => {
    describe.each([
      ['completed', TaskListStatus.COMPLETED],
      ['not_yet_started', TaskListStatus.NOT_YET_STARTED],
      ['cannot_start_yet', TaskListStatus.CANNOT_START_YET],
      ['hidden', TaskListStatus.HIDDEN],
      ['in_progress', TaskListStatus.IN_PROGRESS],
      ['inprogress', TaskListStatus.IN_PROGRESS],
      ['notyetstarted', TaskListStatus.NOT_YET_STARTED],
      ['cannotstartyet', TaskListStatus.CANNOT_START_YET],
      ['notrequired', TaskListStatus.HIDDEN]
    ])('should normalise string statuses', (input, expected) => {
      it(`should normalise "${input}" to correct constant`, () => {
        expect(evaluator.normaliseStatus(input)).toBe(expected)
      })
    })

    describe.each([
      [TaskListStatus.COMPLETED, TaskListStatus.COMPLETED],
      [42, 42],
      [null, null],
      ['unknown_status', 'unknown_status']
    ])('should handle non-normalisable values', (input, expected) => {
      it(`should return ${typeof input} value unchanged`, () => {
        expect(evaluator.normaliseStatus(input)).toBe(expected)
      })
    })
  })

  describe('helper methods', () => {
    it('should check if subsection is completed', () => {
      expect(evaluator.isCompleted('facilities')).toBe(true)
      expect(evaluator.isCompleted('nonexistent')).toBe(false)
    })

    it('should check if subsection is visited', () => {
      expect(evaluator.isVisited('section1')).toBe(true)
      expect(evaluator.isVisited('section2')).toBe(false)
    })

    it('should get base status correctly', () => {
      const completedData = { testSection: { value: 'test' } }
      const completedEvaluator = new ConfigDrivenConditionEvaluator(
        completedData,
        []
      )
      expect(completedEvaluator.getBaseStatus('testSection')).toBe(
        TaskListStatus.COMPLETED
      )

      const visitedEvaluator = new ConfigDrivenConditionEvaluator({}, [
        'testSection'
      ])
      expect(visitedEvaluator.getBaseStatus('testSection')).toBe(
        TaskListStatus.IN_PROGRESS
      )

      expect(evaluator.getBaseStatus('newSection')).toBe(
        TaskListStatus.NOT_YET_STARTED
      )
    })
  })

  describe('evaluateNumericComparison', () => {
    describe.each([
      ['greater than', 10, 5, (a, b) => a > b, true],
      ['greater than', 3, 5, (a, b) => a > b, false],
      ['greater than or equal', 5, 5, (a, b) => a >= b, true],
      ['greater than or equal', 10, 5, (a, b) => a >= b, true],
      ['less than', 3, 5, (a, b) => a < b, true],
      ['less than', 10, 5, (a, b) => a < b, false],
      ['less than or equal', 5, 5, (a, b) => a <= b, true],
      ['less than or equal', 3, 5, (a, b) => a <= b, true]
    ])(
      'should handle %s comparison',
      (description, value1, value2, compareFn, expected) => {
        it(`${value1} ${description} ${value2} should be ${expected}`, () => {
          const result = evaluator.evaluateNumericComparison(
            value1,
            value2,
            compareFn
          )
          expect(result).toBe(expected)
        })
      }
    )

    describe.each([
      ['string', 'string'],
      ['null', null],
      ['undefined', undefined]
    ])('should return false for non-numeric values', (description, value) => {
      it(`returns false when first value is ${description}`, () => {
        const result = evaluator.evaluateNumericComparison(
          value,
          5,
          (a, b) => a > b
        )
        expect(result).toBe(false)
      })
    })
  })

  describe('evaluateEmptyCondition', () => {
    describe.each([
      ['empty string', '', true, true],
      ['empty string', '', false, false],
      ['null', null, true, true],
      ['null', null, false, false],
      ['undefined', undefined, true, true],
      ['undefined', undefined, false, false],
      ['non-empty string', 'value', true, false],
      ['non-empty string', 'value', false, true],
      ['zero', 0, true, false],
      ['false boolean', false, true, false]
    ])(
      'should evaluate %s correctly',
      (description, value, checkEmpty, expected) => {
        it(`${description} with isEmpty=${checkEmpty} should return ${expected}`, () => {
          const result = evaluator.evaluateEmptyCondition(value, checkEmpty)
          expect(result).toBe(expected)
        })
      }
    )
  })

  describe('real-world condition examples', () => {
    const otherFarmersConditionConfig = {
      type: 'conditional',
      rules: [
        {
          if: {
            or: [
              { field: 'facilities.isBuildingSmallerAbattoir', equals: true },
              { field: 'facilities.isBuildingFruitStorage', equals: true },
              {
                field: 'facilities.isProvidingServicesToOtherFarmers',
                equals: true
              },
              { field: 'facilities.isProvidingFruitStorage', equals: true }
            ]
          },
          then: 'not_yet_started'
        },
        {
          if: {
            and: [
              { field: 'facilities.isBuildingSmallerAbattoir', equals: false },
              { field: 'facilities.isBuildingFruitStorage', equals: false },
              {
                field: 'facilities.isProvidingServicesToOtherFarmers',
                equals: false
              },
              { field: 'facilities.isProvidingFruitStorage', equals: false }
            ]
          },
          then: 'hidden'
        }
      ],
      default: 'cannot_start_yet'
    }

    const agentConditionConfig = {
      type: 'conditional',
      rules: [
        {
          if: {
            field: 'who-is-applying.grantApplicantType',
            equals: 'applying-A2'
          },
          then: 'not_yet_started'
        },
        {
          if: { field: 'who-is-applying.grantApplicantType', exists: false },
          then: 'cannot_start_yet'
        }
      ],
      default: 'hidden'
    }

    describe.each([
      [
        'otherFarmersYesOrFruitStorage with at least one true',
        'otherFarmersYesOrFruitStorage',
        otherFarmersConditionConfig,
        createMockConditionEvaluatorData(),
        TaskListStatus.NOT_YET_STARTED
      ],
      [
        'otherFarmersYesOrFruitStorage with all false',
        'otherFarmersYesOrFruitStorage',
        otherFarmersConditionConfig,
        {
          facilities: {
            isBuildingSmallerAbattoir: false,
            isBuildingFruitStorage: false,
            isProvidingServicesToOtherFarmers: false,
            isProvidingFruitStorage: false
          }
        },
        TaskListStatus.HIDDEN
      ],
      [
        'otherFarmersYesOrFruitStorage with one true',
        'otherFarmersYesOrFruitStorage',
        otherFarmersConditionConfig,
        {
          facilities: {
            isBuildingSmallerAbattoir: true,
            isBuildingFruitStorage: false,
            isProvidingServicesToOtherFarmers: false,
            isProvidingFruitStorage: false
          }
        },
        TaskListStatus.NOT_YET_STARTED
      ],
      [
        'agentDetails with default applicant type',
        'agentDetails',
        agentConditionConfig,
        createMockConditionEvaluatorData(),
        TaskListStatus.HIDDEN
      ],
      [
        'agentDetails with agent applicant type',
        'agentDetails',
        agentConditionConfig,
        { 'who-is-applying': { grantApplicantType: 'applying-A2' } },
        TaskListStatus.NOT_YET_STARTED
      ]
    ])(
      'should handle %s condition logic',
      (description, conditionName, config, data, expected) => {
        it(`evaluates ${description} correctly`, () => {
          const testEvaluator = new ConfigDrivenConditionEvaluator(
            data,
            evaluator.visitedSubSections
          )
          const result = testEvaluator.evaluateCondition(conditionName, config)
          expect(result).toBe(expected)
        })
      }
    )
  })
})

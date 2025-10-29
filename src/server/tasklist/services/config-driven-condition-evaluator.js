import { TaskListStatus } from '../../common/constants/tasklist-status-components.js'

export class ConfigDrivenConditionEvaluator {
  constructor(data, visitedSubSections = []) {
    this.data = data || {}
    this.visitedSubSections = visitedSubSections
  }

  evaluateCondition(conditionName, conditionConfig) {
    if (!conditionConfig) {
      throw new Error(`Condition '${conditionName}' not found in config`)
    }

    switch (conditionConfig.type) {
      case 'conditional':
        return this.evaluateConditionalRules(conditionConfig)
      case 'dependency':
        return this.evaluateDependencyRules(conditionConfig)
      default:
        throw new Error(`Unknown condition type: ${conditionConfig.type}`)
    }
  }

  evaluateConditionalRules(conditionConfig) {
    const { rules, default: defaultStatus } = conditionConfig

    for (const rule of rules) {
      if (this.evaluateRule(rule.if)) {
        return this.normaliseStatus(rule.then)
      }
    }

    return this.normaliseStatus(defaultStatus || TaskListStatus.CANNOT_START_YET)
  }

  evaluateDependencyRules(conditionConfig) {
    const { dependsOn, statusMap } = conditionConfig

    const dependencyStatus = this.checkDependencies(dependsOn)

    if (statusMap) {
      return this.normaliseStatus(statusMap[dependencyStatus] || statusMap.default)
    }

    return dependencyStatus ? TaskListStatus.NOT_YET_STARTED : TaskListStatus.CANNOT_START_YET
  }

  evaluateRule(rule) {
    if (!rule) {
      return true
    }

    const ruleType = this.getRuleType(rule)

    switch (ruleType) {
      case 'and':
        return rule.and.every((subRule) => this.evaluateRule(subRule))
      case 'or':
        return rule.or.some((subRule) => this.evaluateRule(subRule))
      case 'not':
        return !this.evaluateRule(rule.not)
      case 'field':
        return this.evaluateFieldCondition(rule)
      default:
        return false
    }
  }

  getRuleType(rule) {
    if (rule.and) {
      return 'and'
    }
    if (rule.or) {
      return 'or'
    }
    if (rule.not) {
      return 'not'
    }
    if (rule.field) {
      return 'field'
    }
    return 'unknown'
  }

  evaluateFieldCondition(rule) {
    const fieldValue = this.getFieldValue(rule.field)

    const operators = [
      {
        key: 'equals',
        handler: (val, ruleVal) => val === ruleVal
      },
      {
        key: 'notEquals',
        handler: (val, ruleVal) => val !== ruleVal
      },
      {
        key: 'exists',
        handler: (val, ruleVal) => (ruleVal ? val !== undefined : val === undefined)
      },
      {
        key: 'in',
        handler: (val, ruleVal) => Array.isArray(ruleVal) && ruleVal.includes(val)
      },
      {
        key: 'notIn',
        handler: (val, ruleVal) => Array.isArray(ruleVal) && !ruleVal.includes(val)
      },
      {
        key: 'gt',
        handler: (val, ruleVal) => this.evaluateNumericComparison(val, ruleVal, (a, b) => a > b)
      },
      {
        key: 'gte',
        handler: (val, ruleVal) => this.evaluateNumericComparison(val, ruleVal, (a, b) => a >= b)
      },
      {
        key: 'lt',
        handler: (val, ruleVal) => this.evaluateNumericComparison(val, ruleVal, (a, b) => a < b)
      },
      {
        key: 'lte',
        handler: (val, ruleVal) => this.evaluateNumericComparison(val, ruleVal, (a, b) => a <= b)
      },
      {
        key: 'isEmpty',
        handler: (val, ruleVal) => this.evaluateEmptyCondition(val, ruleVal)
      }
    ]

    for (const { key, handler } of operators) {
      if (key in rule) {
        return handler(fieldValue, rule[key])
      }
    }

    return false
  }

  evaluateNumericComparison(fieldValue, ruleValue, compareFn) {
    return typeof fieldValue === 'number' && compareFn(fieldValue, ruleValue)
  }

  evaluateEmptyCondition(fieldValue, shouldBeEmpty) {
    const isEmpty = fieldValue === null || fieldValue === undefined || fieldValue === ''
    return shouldBeEmpty ? isEmpty : !isEmpty
  }

  getFieldValue(path) {
    return path.split('.').reduce((obj, key) => obj?.[key], this.data)
  }

  checkDependencies(dependencies) {
    if (Array.isArray(dependencies)) {
      return dependencies.every((dep) => this.isCompleted(dep))
    }

    if (typeof dependencies === 'object' && dependencies !== null) {
      if (dependencies.allOf) {
        return dependencies.allOf.every((dep) => this.isCompleted(dep))
      }

      if (dependencies.anyOf) {
        return dependencies.anyOf.some((dep) => this.isCompleted(dep))
      }

      if (dependencies.noneOf) {
        return !dependencies.noneOf.some((dep) => this.isCompleted(dep))
      }
    }

    return true
  }

  isCompleted(subsectionId) {
    return subsectionId in this.data
  }

  isVisited(subsectionId) {
    return this.visitedSubSections.includes(subsectionId)
  }

  normaliseStatus(status) {
    if (typeof status === 'string') {
      const normalised = status.toLowerCase().replaceAll('_', '')

      switch (normalised) {
        case 'completed':
          return TaskListStatus.COMPLETED
        case 'inprogress':
          return TaskListStatus.IN_PROGRESS
        case 'notyetstarted':
          return TaskListStatus.NOT_YET_STARTED
        case 'cannotstartyet':
          return TaskListStatus.CANNOT_START_YET
        case 'notrequired':
          return TaskListStatus.HIDDEN
        case 'hidden':
          return TaskListStatus.HIDDEN
        default:
          return status
      }
    }

    return status
  }

  getBaseStatus(subsectionId) {
    if (this.isCompleted(subsectionId)) {
      return TaskListStatus.COMPLETED
    }
    if (this.isVisited(subsectionId)) {
      return TaskListStatus.IN_PROGRESS
    }
    return TaskListStatus.NOT_YET_STARTED
  }
}

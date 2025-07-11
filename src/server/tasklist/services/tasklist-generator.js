import { TaskListStatus, taskListStatusComponents } from '../../common/constants/tasklist-status-components.js'
import { ConfigDrivenConditionEvaluator } from './config-driven-condition-evaluator.js'
import { createLogger } from '~/src/server/common/helpers/logging/logger.js'

const logger = createLogger()

export class TasklistGenerator {
  constructor(config) {
    this.config = config
  }

  generateTasklist(data = {}, visitedSubSections = []) {
    const conditions = new ConfigDrivenConditionEvaluator(data, visitedSubSections)

    const statuses = this.determineStatuses(data, visitedSubSections, conditions)

    return {
      pageHeading: this.config.tasklist.title,
      closingDate: this.config.tasklist.closingDate,
      helpText: this.config.tasklist.helpText,
      sections: this.applySectionStatuses(this.config.tasklist.sections, statuses)
    }
  }

  determineStatuses(data, visitedSubSections, conditions) {
    const statuses = {}

    this.config.tasklist.sections.forEach((section) => {
      section.subsections.forEach((subsection) => {
        statuses[subsection.id] = this.getSubsectionStatus(subsection, data, visitedSubSections, conditions, statuses)
      })
    })

    if (this.config.tasklist.statusRules) {
      Object.entries(this.config.tasklist.statusRules).forEach(([id, rule]) => {
        statuses[id] = this.evaluateStatusRule(id, rule, statuses, data, visitedSubSections)
      })
    }

    return statuses
  }

  getSubsectionStatus(subsection, data, visitedSubSections, conditions, currentStatuses) {
    if (subsection.id in data) {
      return TaskListStatus.COMPLETED
    }

    if (visitedSubSections.includes(subsection.id)) {
      return TaskListStatus.IN_PROGRESS
    }

    if (subsection.condition) {
      try {
        const conditionConfig = this.config.tasklist.conditions[subsection.condition]
        const conditionResult = conditions.evaluateCondition(subsection.condition, conditionConfig)

        if (conditionResult !== null && conditionResult !== undefined) {
          return conditionResult
        }
      } catch (error) {
        logger.warn(
          {
            err: error,
            subsectionId: subsection.id,
            condition: subsection.condition
          },
          'Condition evaluation failed, falling back to default status logic'
        )
      }
    }

    if (subsection.dependsOn) {
      const canStart = this.checkDependencies(subsection.dependsOn, currentStatuses)
      if (!canStart) {
        return TaskListStatus.CANNOT_START_YET
      }
    }

    return subsection.required !== false ? TaskListStatus.NOT_YET_STARTED : TaskListStatus.HIDDEN
  }

  checkDependencies(dependencies, statuses) {
    if (Array.isArray(dependencies)) {
      return dependencies.every(
        (dep) => statuses[dep] === TaskListStatus.COMPLETED || statuses[dep] === TaskListStatus.HIDDEN
      )
    }

    if (dependencies.allOf) {
      return dependencies.allOf.every(
        (dep) => statuses[dep] === TaskListStatus.COMPLETED || statuses[dep] === TaskListStatus.HIDDEN
      )
    }

    if (dependencies.anyOf) {
      return dependencies.anyOf.some((dep) => statuses[dep] === TaskListStatus.COMPLETED)
    }

    return true
  }

  evaluateStatusRule(id, rule, statuses, data, visitedSubSections) {
    if (id in data) {
      return TaskListStatus.COMPLETED
    }

    if (visitedSubSections.includes(id)) {
      return TaskListStatus.IN_PROGRESS
    }

    if (rule.type === 'allComplete') {
      const allComplete = rule.dependsOn.every(
        (dep) => statuses[dep] === TaskListStatus.COMPLETED || statuses[dep] === TaskListStatus.HIDDEN
      )
      return allComplete ? TaskListStatus.NOT_YET_STARTED : TaskListStatus.CANNOT_START_YET
    }

    return TaskListStatus.CANNOT_START_YET
  }

  applySectionStatuses(sections, statuses) {
    return sections.map((section) => ({
      title: section.title,
      subsections: section.subsections
        .filter((subsection) => statuses[subsection.id] !== TaskListStatus.HIDDEN)
        .map((subsection) => ({
          title: { text: subsection.title },
          href: this.buildHref(subsection, statuses),
          status: taskListStatusComponents[statuses[subsection.id]]
        }))
    }))
  }

  buildHref(subsection, statuses) {
    const status = statuses[subsection.id]

    if (status === TaskListStatus.CANNOT_START_YET || status === TaskListStatus.HIDDEN) {
      return null
    }

    const baseHref = subsection.href || subsection.id
    const cleanHref = baseHref.startsWith('/') ? baseHref : `/${baseHref}`
    return `${cleanHref}?source=${this.config.tasklist.id}-tasklist`
  }
}

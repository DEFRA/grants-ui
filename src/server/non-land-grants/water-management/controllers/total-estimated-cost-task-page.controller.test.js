import { describe, expect, it } from 'vitest'
import TotalEstimatedCostTaskPageController from './total-estimated-cost-task-page.controller.js'
import TotalEstimatedCostController from './total-estimated-cost.controller.js'

describe('TotalEstimatedCostTaskPageController', () => {
  it('should be a class', () => {
    expect(typeof TotalEstimatedCostTaskPageController).toBe('function')
  })

  it('should extend TotalEstimatedCostController via withTaskContext mixin', () => {
    expect(TotalEstimatedCostTaskPageController.prototype).toBeInstanceOf(TotalEstimatedCostController)
  })
})

import { describe, expect, it } from 'vitest'
import ScoreResultsTaskPageController from './score-results-task-page.controller.js'
import ScoreResultsController from './score-results.controller.js'

describe('ScoreResultsTaskPageController', () => {
  it('should be a class', () => {
    expect(typeof ScoreResultsTaskPageController).toBe('function')
  })

  it('should extend ScoreResultsController via withTaskContext mixin', () => {
    expect(ScoreResultsTaskPageController.prototype).toBeInstanceOf(ScoreResultsController)
  })
})

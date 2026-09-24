import { describe, expect, it } from 'vitest'
import TaskPageController from './task-page.controller.js'
import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'

describe('TaskPageController', () => {
  it('should be a class', () => {
    expect(typeof TaskPageController).toBe('function')
  })

  it('should extend QuestionPageController via withTaskContext mixin', () => {
    expect(TaskPageController.prototype).toBeInstanceOf(QuestionPageController)
  })

  it.each([
    [{}, false],
    [{ components: [] }, false],
    [{ components: [{ type: 'Html', content: 'Guidance' }] }, true]
  ])('declares guidance participation for %s', (pageDef, excluded) => {
    const page = new TaskPageController({}, pageDef)
    page.pageDef = pageDef
    expect(page.excludeFromTaskCompletion).toBe(excluded)
  })
})

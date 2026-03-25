import { describe, expect, it, vi } from 'vitest'
import TerminalPageController from './terminal-page.controller.js'

vi.mock('@defra/forms-engine-plugin/controllers/QuestionPageController.js', () => {
  return {
    QuestionPageController: class QuestionPageController {
      model
      pageDef
      section = undefined

      constructor(model, pageDef) {
        this.model = model
        this.pageDef = pageDef
      }
    }
  }
})

describe('TerminalPageController', () => {
  it('should set allowSaveAndExit to false', () => {
    const model = {
      def: { pages: [{ path: '/exit' }] },
      sections: []
    }
    const controller = new TerminalPageController(model, { path: '/exit' })
    expect(controller.allowSaveAndExit).toBe(false)
  })

  it('should inherit section from the preceding page', () => {
    const section = { id: 'section-1', name: 'eligibility', title: 'Check your eligibility' }
    const model = {
      def: {
        pages: [{ path: '/task-page', section: 'section-1' }, { path: '/exit-page' }]
      },
      sections: [section]
    }

    const controller = new TerminalPageController(model, { path: '/exit-page' })
    expect(controller.section).toBe(section)
  })

  it('should skip pages without a section when looking backwards', () => {
    const section = { id: 'section-1', name: 'eligibility', title: 'Check your eligibility' }
    const model = {
      def: {
        pages: [{ path: '/task-page', section: 'section-1' }, { path: '/other-page' }, { path: '/exit-page' }]
      },
      sections: [section]
    }

    const controller = new TerminalPageController(model, { path: '/exit-page' })
    expect(controller.section).toBe(section)
  })

  it('should not set section if no preceding page has one', () => {
    const model = {
      def: {
        pages: [{ path: '/start' }, { path: '/exit-page' }]
      },
      sections: []
    }

    const controller = new TerminalPageController(model, { path: '/exit-page' })
    expect(controller.section).toBeUndefined()
  })

  it('should not set section if it is the first page', () => {
    const model = {
      def: {
        pages: [{ path: '/exit-page' }]
      },
      sections: []
    }

    const controller = new TerminalPageController(model, { path: '/exit-page' })
    expect(controller.section).toBeUndefined()
  })
})

import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'

/**
 * Custom TerminalPageController that inherits the section from the preceding
 * page in the form definition. This shows the section title on exit pages
 * without adding them to the task list.
 */
export default class TerminalPageController extends QuestionPageController {
  allowSaveAndExit = false

  /**
   * @param {FormModel} model
   * @param {PageTerminal} pageDef
   */
  constructor(model, pageDef) {
    super(model, pageDef)

    if (!this.section) {
      const pages = model.def.pages
      const currentIndex = pages.findIndex((p) => p.path === pageDef.path)

      for (let i = currentIndex - 1; i >= 0; i--) {
        if (pages[i].section) {
          this.section = model.sections.find((section) => section.id === pages[i].section)
          break
        }
      }
    }
  }
}

/**
 * @import { FormModel } from '@defra/forms-engine-plugin/engine/models/index.js'
 * @import { PageTerminal } from '@defra/forms-model'
 */

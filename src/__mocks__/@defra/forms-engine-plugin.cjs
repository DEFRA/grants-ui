class QuestionPageController {
  /**
   * @param {MockPage} page
   * @param {FormModel} model
   * @param {Record<string, unknown>} [options]
   */
  constructor(page, model, options = {}) {
    this.page = page
    this.model = model
    this.options = options
    this.viewName = page?.name || 'default-view'
  }

  makeGetRouteHandler() {
    return () => ({ view: this.viewName })
  }

  makePostRouteHandler() {
    return () => ({ redirect: '/next' })
  }
}

class StatusPageController {
  /**
   * @param {MockPage} page
   * @param {FormModel} model
   * @param {Record<string, unknown>} [options]
   */
  constructor(page, model, options = {}) {
    this.page = page
    this.model = model
    this.options = options
    this.viewName = page?.name || 'status-view'
  }

  makeGetRouteHandler() {
    return () => ({ view: this.viewName })
  }
}

class SummaryPageController {
  /**
   * @param {MockPage} page
   * @param {FormModel} model
   * @param {Record<string, unknown>} [options]
   */
  constructor(page, model, options = {}) {
    this.page = page
    this.model = model
    this.options = options
    this.viewName = page?.name || 'summary-view'
  }

  makeGetRouteHandler() {
    return () => ({ view: this.viewName })
  }
}

module.exports = {
  QuestionPageController,
  StatusPageController,
  SummaryPageController,
  plugin: {
    name: 'forms-engine-plugin',
    register: () => {},
    controllers: {}
  }
}

/**
 * @import { FormModel } from '@defra/forms-engine-plugin/engine/models/index.js'
 * @typedef {{ name?: string }} MockPage
 */

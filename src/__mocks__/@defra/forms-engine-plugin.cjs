class QuestionPageController {
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

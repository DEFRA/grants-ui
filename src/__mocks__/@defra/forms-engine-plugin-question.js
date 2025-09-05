import { vi } from 'vitest'

export class QuestionPageController {
  static get components() {
    return {
      RADIOS: 'radios',
      CHECKBOXES: 'checkboxes',
      INPUT: 'input',
      TEXTAREA: 'textarea',
      MULTI_INPUT: 'multi-input',
      FILE_UPLOAD: 'file-upload',
      DATE: 'date',
      SEARCH_LIST: 'search-list'
    }
  }

  constructor(options) {
    this.options = options
  }

  getViewModel(request, context) {
    return {
      pageTitle: 'Default Title'
    }
  }

  makeGetRouteHandler() {
    return vi.fn()
  }

  makePostRouteHandler() {
    return vi.fn()
  }

  proceed() {
    return vi.fn()
  }

  getNextPath() {
    return '/next'
  }

  setState() {
    return vi.fn()
  }

  getHandler() {
    return null
  }

  postHandler() {
    return null
  }

  getServerReferenceData() {
    return null
  }

  processSessionData() {
    return null
  }

  createModel() {
    return null
  }

  setFormContent() {
    return null
  }

  validateSubmission() {
    return null
  }

  handleNavigation() {
    return null
  }
}

export default QuestionPageController

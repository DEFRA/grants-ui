import { QuestionPageController } from './QuestionPageController.js'

describe('QuestionPageController', () => {
  test('should store options on construction', () => {
    const options = { foo: 'bar' }
    const controller = new QuestionPageController(options)
    expect(controller.options).toEqual(options)
  })

  test('components getter returns expected structure', () => {
    expect(QuestionPageController.components).toEqual({
      RADIOS: 'radios',
      CHECKBOXES: 'checkboxes',
      INPUT: 'input',
      TEXTAREA: 'textarea',
      MULTI_INPUT: 'multi-input',
      FILE_UPLOAD: 'file-upload',
      DATE: 'date',
      SEARCH_LIST: 'search-list'
    })
  })

  test('all instance methods return null or undefined as expected', async () => {
    const controller = new QuestionPageController({})

    expect(controller.getHandler()).toBeNull()
    expect(controller.postHandler()).toBeNull()
    expect(controller.getServerReferenceData()).toBeNull()
    expect(controller.processSessionData()).toBeNull()
    expect(controller.createModel()).toBeNull()
    expect(controller.setFormContent()).toBeNull()
    expect(controller.validateSubmission()).toBeNull()
    expect(controller.handleNavigation()).toBeNull()

    await expect(controller.handleGetRequest()).resolves.toBeUndefined()
    await expect(controller.handlePostRequest()).resolves.toBeUndefined()
  })
})

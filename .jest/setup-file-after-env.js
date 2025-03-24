// Globally mock redis in tests
jest.mock('ioredis')

jest.mock(
  '@defra/forms-engine-plugin/controllers/QuestionPageController.js',
  () => {
    return {
      QuestionPageController:
        require('../src/server/__mocks__/QuestionPageController.js')
          .QuestionPageController
    }
  }
)

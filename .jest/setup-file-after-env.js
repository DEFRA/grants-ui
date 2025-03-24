// Globally mock redis in tests
jest.mock('ioredis')

// Mock the QuestionPageController import
jest.mock(
  '@defra/forms-engine-plugin/controllers/QuestionPageController.js',
  () => {
    return {
      QuestionPageController:
        require('../src/server/mocks/QuestionPageController.js')
          .QuestionPageController
    }
  }
  //   { virtual: true }
)

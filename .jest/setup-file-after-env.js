// Globally mock redis in tests
jest.mock('ioredis', () => ({
  ...jest.requireActual('ioredis'),
  Cluster: jest.fn().mockReturnValue({ on: () => ({}) }),
  Redis: jest.fn().mockReturnValue({ on: () => ({}) })
}))

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

jest.mock(
  '@defra/forms-engine-plugin/controllers/StatusPageController.js',
  () => {
    return {
      StatusPageController:
        require('../src/server/__mocks__/StatusPageController.js')
          .StatusPageController
    }
  }
)

jest.mock(
  '@defra/forms-engine-plugin/controllers/SummaryPageController.js',
  () => {
    return {
      SummaryPageController:
        require('../src/server/__mocks__/SummaryPageController.js')
          .SummaryPageController
    }
  }
)

import { vi } from 'vitest'

vi.mock('ioredis', () => ({
  default: vi.fn().mockReturnValue({ on: () => ({}) }),
  Cluster: vi.fn().mockReturnValue({ on: () => ({}) }),
  Redis: vi.fn().mockReturnValue({ on: () => ({}) })
}))

vi.mock('@defra/forms-engine-plugin/controllers/QuestionPageController.js', () => {
  const { QuestionPageController } = require('../src/__mocks__/@defra/forms-engine-plugin.cjs')
  return {
    QuestionPageController
  }
})

vi.mock('@defra/forms-engine-plugin/controllers/StatusPageController.js', () => {
  const { StatusPageController } = require('../src/__mocks__/@defra/forms-engine-plugin.cjs')
  return {
    StatusPageController
  }
})

vi.mock('@defra/forms-engine-plugin/controllers/SummaryPageController.js', () => {
  const { SummaryPageController } = require('../src/__mocks__/@defra/forms-engine-plugin.cjs')
  return {
    SummaryPageController
  }
})

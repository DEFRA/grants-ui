import fetchMock from 'jest-fetch-mock'

jest.mock('@defra/forms-engine-plugin')
jest.mock('@defra/forms-model')
jest.mock('@hapi/h2o2', () => ({
  plugin: { name: 'h2o2', register: jest.fn() }
}))

global.fetch = fetchMock

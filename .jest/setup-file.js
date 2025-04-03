import fetchMock from 'jest-fetch-mock'

jest.mock('@defra/forms-engine-plugin')
jest.mock('@defra/forms-model')

global.fetch = fetchMock

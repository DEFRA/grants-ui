import fetchMock from 'jest-fetch-mock'

jest.mock('@defra/forms-engine-plugin')

global.fetch = fetchMock

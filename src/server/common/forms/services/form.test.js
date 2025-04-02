import { formsService } from './form.js'
import { readFile } from 'fs/promises'
import { exampleGrantMetadata, landGrantsMetadata } from '../config.js'

// Mock URL and import.meta.url
const mockUrl = { pathname: '/mock/path' }
global.URL = jest.fn(() => mockUrl)
global.import = { meta: { url: 'file:///mock/path' } }

// Mock config
jest.mock('~/src/config/config.js', () => ({
  config: {
    get: jest.fn((key) => (key === 'cdpEnvironment' ? 'local' : undefined))
  }
}))

jest.mock('fs/promises', () => ({
  readFile: jest.fn()
}))

const addingValueMetadataMock = { id: 'example-id', slug: 'example-slug' }
const exampleGrantMetadataMock = { id: 'example-id', slug: 'example-slug' }
const landGrantsMetadataMock = { id: 'land-id', slug: 'land-slug' }

jest.mock('../config.js', () => ({
  exampleGrantMetadata: exampleGrantMetadataMock,
  landGrantsMetadata: landGrantsMetadataMock,
  addingValueMetadata: addingValueMetadataMock
}))

const example = (v) =>
  JSON.stringify({
    name: v,
    pages: [
      {
        events: {
          onLoad: {
            options: {
              url: 'http://cdpEnvironment.example.com'
            }
          }
        }
      }
    ]
  })

describe('formsService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    readFile.mockReset()
  })

  describe('getFormDefinition', () => {
    test('returns exampleGrantDefinition for matching id', async () => {
      const mockData = example('example-definition')
      readFile.mockResolvedValue(mockData)

      const result = await formsService.getFormDefinition(
        exampleGrantMetadata.id
      )
      expect(result).toEqual({
        name: 'example-definition',
        pages: [
          {
            events: {
              onLoad: {
                options: {
                  url: 'http://localhost:3001/scoring/api/v1/adding-value/score?allowPartialScoring=true'
                }
              }
            }
          }
        ]
      })
    })

    test('returns landGrantsDefinition for matching id', async () => {
      const mockData = example('land-definition')
      readFile.mockResolvedValue(mockData)

      const result = await formsService.getFormDefinition(landGrantsMetadata.id)
      expect(result).toEqual({
        name: 'land-definition',
        pages: [
          {
            events: {
              onLoad: {
                options: {
                  url: 'http://localhost:3001/scoring/api/v1/adding-value/score?allowPartialScoring=true'
                }
              }
            }
          }
        ]
      })
    })

    test('returns addingValueDefinition for matching id', async () => {
      const mockData = example('adding-value-definition')
      readFile.mockResolvedValue(mockData)

      const result = await formsService.getFormDefinition(
        addingValueMetadataMock.id
      )
      expect(result).toEqual({
        name: 'adding-value-definition',
        pages: [
          {
            events: {
              onLoad: {
                options: {
                  url: 'http://localhost:3001/scoring/api/v1/adding-value/score?allowPartialScoring=true'
                }
              }
            }
          }
        ]
      })
    })

    test('throws Boom notFound for unknown id', async () => {
      const mockData = example('irrelevant')
      readFile.mockResolvedValue(mockData)

      await expect(
        formsService.getFormDefinition('invalid-slug')
      ).rejects.toThrow("Form 'invalid-slug' not found")
    })

    test('handles non-SyntaxError file reading errors', async () => {
      readFile.mockRejectedValue(new Error('File not found'))

      await expect(
        formsService.getFormDefinition(exampleGrantMetadata.id)
      ).rejects.toThrow('File not found')
    })

    test('handles JSON parsing errors', async () => {
      readFile.mockResolvedValue('invalid json')

      await expect(
        formsService.getFormDefinition(exampleGrantMetadata.id)
      ).rejects.toThrow('Invalid JSON in form definition file')
    })

    test('handles form definition without events', async () => {
      const mockData = JSON.stringify({
        name: 'no-events',
        pages: [{ title: 'Page 1' }]
      })
      readFile.mockResolvedValue(mockData)

      const result = await formsService.getFormDefinition(
        exampleGrantMetadata.id
      )
      expect(result).toEqual({
        name: 'no-events',
        pages: [{ title: 'Page 1' }]
      })
    })

    test('handles form definition with events but no onLoad', async () => {
      const mockData = JSON.stringify({
        name: 'no-onload',
        pages: [{ events: { otherEvent: {} } }]
      })
      readFile.mockResolvedValue(mockData)

      const result = await formsService.getFormDefinition(
        exampleGrantMetadata.id
      )
      expect(result).toEqual({
        name: 'no-onload',
        pages: [{ events: { otherEvent: {} } }]
      })
    })
  })

  describe('getFormMetadata', () => {
    test('returns exampleGrantDefinition for matching id', async () => {
      const result = await formsService.getFormMetadata(
        exampleGrantMetadata.slug
      )
      expect(result).toEqual(exampleGrantMetadataMock)
    })

    test('returns landGrantsDefinition for matching id', async () => {
      const result = await formsService.getFormMetadata(landGrantsMetadata.slug)
      expect(result).toEqual(landGrantsMetadataMock)
    })

    test('returns addingValueMetadata for matching slug', async () => {
      const result = await formsService.getFormMetadata(
        addingValueMetadataMock.slug
      )
      expect(result).toEqual(addingValueMetadataMock)
    })

    test('throws Boom notFound for unknown id', async () => {
      await expect(
        formsService.getFormMetadata('invalid-slug')
      ).rejects.toThrow("Form 'invalid-slug' not found")
    })
  })
})

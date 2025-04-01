import { formsService } from './form.js'
import { readFile } from 'fs/promises'
import { exampleGrantMetadata, landGrantsMetadata } from '../config.js'

jest.mock('fs/promises', () => ({
  readFile: jest.fn()
}))

const exampleGrantMetadataMock = { id: 'example-id', slug: 'example-slug' }
const landGrantsMetadataMock = { id: 'land-id', slug: 'land-slug' }

jest.mock('../config.js', () => ({
  exampleGrantMetadata: exampleGrantMetadataMock,
  landGrantsMetadata: landGrantsMetadataMock
}))

const example = (v) => JSON.stringify({ name: v })

describe('formsService', () => {
  describe('getFormDefinition', () => {
    test('returns exampleGrantDefinition for matching id', async () => {
      readFile.mockResolvedValueOnce(example('example-definition1'))
      readFile.mockResolvedValueOnce(example('example-definition2'))

      const result = await formsService.getFormDefinition(
        exampleGrantMetadata.id
      )
      expect(result).toEqual({ name: 'example-definition1' })
    })

    test('returns landGrantsDefinition for matching id', async () => {
      readFile.mockResolvedValueOnce(example('land-definition1'))
      readFile.mockResolvedValueOnce(example('land-definition2'))

      const result = await formsService.getFormDefinition(landGrantsMetadata.id)
      expect(result).toEqual({ name: 'land-definition2' })
    })

    test('throws Boom notFound for unknown id', async () => {
      readFile.mockResolvedValueOnce(example('irrelevent'))
      readFile.mockResolvedValueOnce(example('irrelevant'))

      await expect(
        formsService.getFormDefinition('invalid-slug')
      ).rejects.toThrow("Form 'invalid-slug' not found")
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

    test('throws Boom notFound for unknown id', async () => {
      await expect(
        formsService.getFormMetadata('invalid-slug')
      ).rejects.toThrow("Form 'invalid-slug' not found")
    })
  })
})

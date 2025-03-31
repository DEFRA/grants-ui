import Boom from '@hapi/boom'
import fs from 'fs/promises'
import { exampleGrantMetadata, landGrantsMetadata } from '../config.js'

export const formsService = {
  getFormMetadata: function (slug) {
    switch (slug) {
      case exampleGrantMetadata.slug:
        return Promise.resolve(exampleGrantMetadata)
      case landGrantsMetadata.slug:
        return Promise.resolve(landGrantsMetadata)
      default:
        throw Boom.notFound(`Form '${slug}' not found`)
    }
  },
  getFormDefinition: async function (id) {
    const exampleGrantPath = new URL(
      '../definitions/example-grant.json',
      import.meta.url
    ).pathname
    const landGrantsPath = new URL(
      '../definitions/find-funding-for-land-or-farms.json',
      import.meta.url
    ).pathname

    const exampleGrantDefinition = JSON.parse(
      await fs.readFile(exampleGrantPath, 'utf8')
    )

    const landGrantsDefinition = JSON.parse(
      await fs.readFile(landGrantsPath, 'utf8')
    )

    switch (id) {
      case exampleGrantMetadata.id:
        return Promise.resolve(exampleGrantDefinition)
      case landGrantsMetadata.id:
        return Promise.resolve(landGrantsDefinition)
      default:
        throw Boom.notFound(`Form '${id}' not found`)
    }
  }
}

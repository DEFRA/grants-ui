import Boom from '@hapi/boom'
import exampleGrantDefinition from '~/src/server/common/forms/definitions/example-grant.json'
import landGrantsDefinition from '~/src/server/common/forms/definitions/find-funding-for-land-or-farms.json'
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
  getFormDefinition: function (id) {
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

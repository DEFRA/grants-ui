import Boom from '@hapi/boom'
import { landGrantsMetadata } from '~/src/server/common/forms/config.js'
import landGrantsDefinition from '~/src/server/common/forms/data/find-funding-for-land-or-farms.json'

export const formsService = {
  getFormMetadata: function (slug) {
    switch (slug) {
      case landGrantsMetadata.slug:
        return Promise.resolve(landGrantsMetadata)
      default:
        throw Boom.notFound(`Form '${slug}' not found`)
    }
  },
  getFormDefinition: function (id) {
    switch (id) {
      case landGrantsMetadata.id:
        return Promise.resolve(landGrantsDefinition)
      default:
        throw Boom.notFound(`Form '${id}' not found`)
    }
  }
}

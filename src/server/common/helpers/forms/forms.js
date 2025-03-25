import Boom from '@hapi/boom'
import { landGrantsMetadata } from '~/src/server/common/helpers/forms/config.js'
import landGrantsDefinition from '~/src/server/common/helpers/forms/data/find-funding-for-land-or-farms.json'

export const outputService = {
  submit: async function () {
    return Promise.resolve()
  }
}

export const formSubmissionService = {
  submit: function () {
    return Promise.resolve({
      message: 'string',
      result: {}
    })
  }
}

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

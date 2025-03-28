import Boom from '@hapi/boom'
import fs from 'fs/promises'
import { addingValueMetadata, exampleGrantMetadata, landGrantsMetadata } from '../config.js'

const getJsonFromFile = async function (path) {
  const url = new URL(`../definitions/${path}`, import.meta.url).pathname
  return JSON.parse(await fs.readFile(url, 'utf8'))
}

export const formsService = {
  getFormMetadata: async function (slug) {
    switch (slug) {
      case addingValueMetadata.slug:
        return Promise.resolve(addingValueMetadata)
      case exampleGrantMetadata.slug:
        return Promise.resolve(exampleGrantMetadata)
      case landGrantsMetadata.slug:
        return Promise.resolve(landGrantsMetadata)
      default:
        throw Boom.notFound(`Form '${slug}' not found`)
    }
  },
  getFormDefinition: async function (id) {
    const addingValue = getJsonFromFile('adding-value.json')
    const exampleGrant = getJsonFromFile('example-grant.json')
    const landGrants = getJsonFromFile('find-funding-for-land-or-farms.json')

    switch (id) {
      case addingValueMetadata.id:
        return Promise.resolve(addingValue)
      case exampleGrantMetadata.id:
        return Promise.resolve(exampleGrant)
      case landGrantsMetadata.id:
        return Promise.resolve(landGrants)
      default:
        throw Boom.notFound(`Form '${id}' not found`)
    }
  }
}

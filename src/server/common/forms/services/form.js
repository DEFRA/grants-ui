import Boom from '@hapi/boom'
import fs from 'fs/promises'
import { addingValueMetadata, exampleGrantMetadata, landGrantsMetadata } from '../config.js'
import { config } from '~/src/config/config.js'

const getJsonFromFile = async function (path) {
  const url = new URL(`../definitions/${path}`, import.meta.url).pathname
  return JSON.parse(await fs.readFile(url, 'utf8'))
}

const environment = config.get('cdpEnvironment')

function configureFormDefinition(definition) {
  if (definition.pages) {
    definition.pages.forEach((page) => {
      const events = page.events
      if (events) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (events.onLoad?.options.url && environment !== 'local') {
          events.onLoad.options.url = events.onLoad.options.url.replace(
            'cdpEnvironment',
            environment
          )
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        } else if (events.onLoad?.options.url && environment === 'local') {
          events.onLoad.options.url =
            'http://localhost:3001/scoring/api/v1/adding-value/score?allowPartialScoring=true'
        }
      }
    })
  }
  return definition
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
        return Promise.resolve(configureFormDefinition(addingValue))
      case exampleGrantMetadata.id:
        return Promise.resolve(configureFormDefinition(exampleGrant))
      case landGrantsMetadata.id:
        return Promise.resolve(configureFormDefinition(landGrants))
      default:
        throw Boom.notFound(`Form '${id}' not found`)
    }
  }
}

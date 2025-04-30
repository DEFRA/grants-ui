import Boom from '@hapi/boom'
import fs from 'fs/promises'
import {
  addingValueMetadata,
  exampleGrantMetadata,
  landGrantsMetadata
} from '../config.js'
import { config } from '~/src/config/config.js'
import { createLogger } from '~/src/server/common/helpers/logging/logger.js'

const getJsonFromFile = async function (path) {
  const url = new URL(`../definitions/${path}`, import.meta.url).pathname
  return JSON.parse(await fs.readFile(url, 'utf8'))
}

function configureFormDefinition(definition) {
  const logger = createLogger()
  const environment = config.get('cdpEnvironment')

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
            process.env.SCORING_SERVICE_URL ??
            events.onLoad.options.url.replace(
              '.cdpEnvironment.cdp-int.defra.cloud',
              ''
            )
        } else {
          // If we have a URL but environment is neither 'local' nor a non-local environment,
          // we should log this unexpected case but not modify the URL
          logger.warn(`Unexpected environment value: ${environment}`)
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
    try {
      const [addingValue, exampleGrant, landGrants] = await Promise.all([
        getJsonFromFile('adding-value.json'),
        getJsonFromFile('example-grant.json'),
        getJsonFromFile('find-funding-for-land-or-farms.json')
      ])

      switch (id) {
        case addingValueMetadata.id:
          return configureFormDefinition(await addingValue)
        case exampleGrantMetadata.id:
          return configureFormDefinition(await exampleGrant)
        case landGrantsMetadata.id:
          return configureFormDefinition(await landGrants)
        default:
          throw Boom.notFound(`Form '${id}' not found`)
      }
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error('Invalid JSON in form definition file')
      }
      throw error
    }
  }
}

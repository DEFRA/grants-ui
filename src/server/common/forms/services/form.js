import { metadata } from '../config.js'
import { config } from '~/src/config/config.js'
import { createLogger } from '~/src/server/common/helpers/logging/logger.js'

import { FileFormService } from '@defra/forms-engine-plugin/file-form-service.js'

export function configureFormDefinition(definition) {
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
            'http://localhost:3001/scoring/api/v1/adding-value/score?allowPartialScoring=true'
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

class GrantsFormLoader extends FileFormService {
  getFormDefinition(id) {
    const definition = super.getFormDefinition(id)

    return configureFormDefinition(definition)
  }
}

export const formsService = async () => {
  const loader = new GrantsFormLoader()

  // Add a Json form
  await loader.addForm(
    'src/server/common/forms/definitions/adding-value.yaml',
    {
      ...metadata,
      id: '95e92559-968d-44ae-8666-2b1ad3dffd31',
      slug: 'adding-value',
      title: 'Adding value'
    }
  )

  await loader.addForm(
    'src/server/common/forms/definitions/example-grant.json',
    {
      ...metadata,
      id: '5eeb9f71-44f8-46ed-9412-3d5e2c5ab2bc',
      slug: 'example-grant',
      title: 'Example grant'
    }
  )

  await loader.addForm(
    'src/server/common/forms/definitions/find-funding-for-land-or-farms.json',
    {
      ...metadata,
      id: '5c67688f-3c61-4839-a6e1-d48b598257f1',
      slug: 'find-funding-for-land-or-farms',
      title: 'Find Funding for Land or Farms'
    }
  )

  return loader.toFormsService()
}

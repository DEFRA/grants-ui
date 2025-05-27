import { config } from '~/src/config/config.js'
import { createLogger } from '~/src/server/common/helpers/logging/logger.js'
import { metadata } from '../config.js'

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

  // Add all forms
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
    'src/server/common/forms/definitions/example-grant.yaml',
    {
      ...metadata,
      id: '5eeb9f71-44f8-46ed-9412-3d5e2c5ab2bc',
      slug: 'example-grant',
      title: 'Example grant'
    }
  )

  await loader.addForm(
    'src/server/common/forms/definitions/find-funding-for-land-or-farms.yaml',
    {
      ...metadata,
      id: '5c67688f-3c61-4839-a6e1-d48b598257f1',
      slug: 'find-funding-for-land-or-farms',
      title: 'Find Funding for Land or Farms'
    }
  )

  await loader.addForm(
    'src/server/common/forms/definitions/adding-value/business-status.yaml',
    {
      ...metadata,
      id: '93f1e83f-cb08-4615-84fd-4daabab9a552',
      slug: 'business-status',
      title: 'Business status'
    }
  )

  await loader.addForm(
    'src/server/common/forms/definitions/adding-value/project-preparation.yaml',
    {
      ...metadata,
      id: '30757a0e-2648-458b-9ade-030680662033',
      slug: 'project-preparation',
      title: 'Project preparation'
    }
  )

  await loader.addForm(
    'src/server/common/forms/definitions/adding-value/facilities.yaml',
    {
      ...metadata,
      id: '525a69d4-1064-4ae9-8ad4-07df0e7bbf64',
      slug: 'facilities',
      title: 'Facilities'
    }
  )

  await loader.addForm(
    'src/server/common/forms/definitions/adding-value/costs.yaml',
    {
      ...metadata,
      id: '92f595e3-b88b-41ef-b55b-1e88b0495827',
      slug: 'costs',
      title: 'Costs'
    }
  )

  await loader.addForm(
    'src/server/common/forms/definitions/adding-value/produce-processed.yaml',
    {
      ...metadata,
      id: '61a9c744-c2f5-4b19-8aaa-1ebce72063d3',
      slug: 'produce-processed',
      title: 'Produce'
    }
  )

  await loader.addForm(
    'src/server/common/forms/definitions/adding-value/project-impact.yaml',
    {
      ...metadata,
      id: '2f675a91-01c0-41bb-8558-296b5e0eafd9',
      slug: 'project-impact',
      title: 'Project'
    }
  )

  await loader.addForm(
    'src/server/common/forms/definitions/adding-value/manual-labour-amount.yaml',
    {
      ...metadata,
      id: '1c662c58-35ed-4975-bfb8-418acd607a34',
      slug: 'manual-labour-amount',
      title: 'Mechanisation'
    }
  )

  await loader.addForm(
    'src/server/common/forms/definitions/adding-value/future-customers.yaml',
    {
      ...metadata,
      id: 'b36a6415-f46f-4ac5-84ca-db0d209a6559',
      slug: 'future-customers',
      title: 'Future customers'
    }
  )

  await loader.addForm(
    'src/server/common/forms/definitions/adding-value/collaboration.yaml',
    {
      ...metadata,
      id: 'd2feb2b3-bf1c-4639-8108-129a2eb0ea0a',
      slug: 'collaboration',
      title: 'Collaboration'
    }
  )

  await loader.addForm(
    'src/server/common/forms/definitions/adding-value/environmental-impact.yaml',
    {
      ...metadata,
      id: 'd5e8404c-73fb-4721-b329-4ab604840e53',
      slug: 'environmental-impact',
      title: 'Environment'
    }
  )

  await loader.addForm(
    'src/server/common/forms/definitions/adding-value/score-results.yaml',
    {
      ...metadata,
      id: '240dd256-48e5-476a-aec5-492528898405',
      slug: 'score-results',
      title: 'Score results'
    }
  )

  await loader.addForm(
    'src/server/common/forms/definitions/adding-value/business-details.yaml',
    {
      ...metadata,
      id: 'a6d41baf-17a5-48fc-9aa2-fe5e9246fa48',
      slug: 'business-details',
      title: 'Business Details'
    }
  )

  await loader.addForm(
    'src/server/common/forms/definitions/adding-value/who-is-applying.yaml',
    {
      ...metadata,
      id: 'dac378f9-136b-49d1-8c58-2d4c90d7b1d1',
      slug: 'who-is-applying',
      title: 'Who is applying'
    }
  )

  await loader.addForm(
    'src/server/common/forms/definitions/adding-value/agent-details.yaml',
    {
      ...metadata,
      id: '21dc9fc7-15da-419a-b7fd-baa2a7500a18',
      slug: 'agent-details',
      title: 'Agent'
    }
  )

  await loader.addForm(
    'src/server/common/forms/definitions/adding-value/applicant-details.yaml',
    {
      ...metadata,
      id: 'f3f08612-a020-44e9-9851-9618820129ff',
      slug: 'applicant-details',
      title: 'Applicant'
    }
  )

  await loader.addForm(
    'src/server/common/forms/definitions/adding-value/check-details.yaml',
    {
      ...metadata,
      id: '9dd81344-0c6b-405c-b345-f7d11cfc05b6',
      slug: 'check-details',
      title: 'Check your details'
    }
  )

  await loader.addForm(
    'src/server/common/forms/definitions/adding-value/declaration.yaml',
    {
      ...metadata,
      id: '7ccfcdda-6e8f-4963-be8e-2b16f12d7ebf',
      slug: 'declaration',
      title: 'Confirm and send'
    }
  )

  return loader.toFormsService()
}

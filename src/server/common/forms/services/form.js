import { config } from '~/src/config/config.js'
import { createLogger } from '~/src/server/common/helpers/logging/logger.js'
import { metadata } from '../config.js'
import { FileFormService } from '@defra/forms-engine-plugin/file-form-service.js'
import { allForms } from './forms-config.js'

export function configureFormDefinition(definition) {
  const logger = createLogger()
  const environment = config.get('cdpEnvironment')

  if (definition.pages) {
    definition.pages.forEach((page) => {
      const events = page.events
      if (events) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (events.onLoad?.options.url && environment !== 'local') {
          events.onLoad.options.url = events.onLoad.options.url.replace('cdpEnvironment', environment)
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        } else if (events.onLoad?.options.url && environment === 'local') {
          events.onLoad.options.url = 'http://localhost:3001/scoring/api/v1/adding-value/score?allowPartialScoring=true'
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

export async function addAllForms(loader, forms) {
  const addedForms = new Set()
  const logger = createLogger()

  const uniqueForms = forms.filter((form) => {
    const key = `${form.id}-${form.slug}`
    if (addedForms.has(key)) {
      logger.warn(`Skipping duplicate form: ${form.slug} with id ${form.id}`)
      return false
    }
    addedForms.add(key)
    return true
  })

  await Promise.all(
    uniqueForms.map((form) =>
      loader.addForm(form.path, {
        ...metadata,
        id: form.id,
        slug: form.slug,
        title: form.title
      })
    )
  )

  return addedForms.size
}

export const formsService = async () => {
  const loader = new GrantsFormLoader()

  await addAllForms(loader, allForms)

  return loader.toFormsService()
}

import Boom from '@hapi/boom'
import exampleGrantDefinition from '~/src/server/forms/example-grant.json'
import landGrantsDefinition from '~/src/server/forms/find-funding-for-land-or-farms.json'

const now = new Date()
const user = {
  id: 'grants-user',
  displayName: 'Grants dev'
}
const author = {
  createdAt: now,
  createdBy: user,
  updatedAt: now,
  updatedBy: user
}

const metadata = {
  organisation: 'Defra',
  teamName: 'Grants',
  teamEmail: 'grants@defra.gov.uk',
  submissionGuidance: "Thanks for your submission, we'll be in touch",
  notificationEmail: 'cl-defra-tactical-grants-test-rpa-email@equalexperts.com',
  ...author,
  live: author
}

const exampleGrantMetadata = {
  id: '5eeb9f71-44f8-46ed-9412-3d5e2c5ab2bc',
  slug: 'example-grant',
  title: 'Example grant',
  ...metadata
}

const landGrantsMetadata = {
  id: '5c67688f-3c61-4839-a6e1-d48b598257f1',
  slug: 'find-funding-for-land-or-farms',
  title: 'Find Funding for Land or Farms',
  ...metadata
}

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

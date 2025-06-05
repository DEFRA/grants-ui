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

export const metadata = {
  organisation: 'Defra',
  teamName: 'Grants',
  teamEmail: 'grants@defra.gov.uk',
  submissionGuidance: "Thanks for your submission, we'll be in touch",
  notificationEmail: 'cl-defra-tactical-grants-test-rpa-email@equalexperts.com',
  ...author,
  live: author
}

export const addingValueMetadata = {
  id: '95e92559-968d-44ae-8666-2b1ad3dffd31',
  slug: 'adding-value',
  title: 'Adding value',
  authRequired: true,
  ...metadata
}

export const exampleGrantMetadata = {
  id: '5eeb9f71-44f8-46ed-9412-3d5e2c5ab2bc',
  slug: 'example-grant',
  title: 'Example grant',
  authRequired: false,
  ...metadata
}

export const landGrantsMetadata = {
  id: '5c67688f-3c61-4839-a6e1-d48b598257f1',
  slug: 'find-funding-for-land-or-farms',
  title: 'Find Funding for Land or Farms',
  authRequired: true,
  ...metadata
}

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
  ...metadata
}

export const exampleGrantMetadata = {
  id: '5eeb9f71-44f8-46ed-9412-3d5e2c5ab2bc',
  slug: 'example-grant',
  title: 'Example grant',
  ...metadata
}

export const landGrantsMetadata = {
  id: '5c67688f-3c61-4839-a6e1-d48b598257f1',
  slug: 'find-funding-for-land-or-farms',
  title: 'Find Funding for Land or Farms',
  ...metadata
}

export const businessStatusMetadata = {
  id: '93f1e83f-cb08-4615-84fd-4daabab9a552',
  slug: 'business-status',
  title: 'Business status',
  ...metadata
}

export const projectPreparationMetadata = {
  id: '30757a0e-2648-458b-9ade-030680662033',
  slug: 'project-preparation',
  title: 'Project preparation',
  ...metadata
}

export const facilitiesMetadata = {
  id: '525a69d4-1064-4ae9-8ad4-07df0e7bbf64',
  slug: 'facilities',
  title: 'Facilities',
  ...metadata
}

export const costsMetadata = {
  id: '92f595e3-b88b-41ef-b55b-1e88b0495827',
  slug: 'costs',
  title: 'Costs',
  ...metadata
}

export const produceProcessedMetadata = {
  id: '61a9c744-c2f5-4b19-8aaa-1ebce72063d3',
  slug: 'produce-processed',
  title: 'Produce',
  ...metadata
}

export const projectImpactMetadata = {
  id: '2f675a91-01c0-41bb-8558-296b5e0eafd9',
  slug: 'project-impact',
  title: 'Project',
  ...metadata
}

export const manualLabourAmountMetadata = {
  id: '1c662c58-35ed-4975-bfb8-418acd607a34',
  slug: 'manual-labour-amount',
  title: 'Mechanisation',
  ...metadata
}

export const futureCustomersMetadata = {
  id: 'b36a6415-f46f-4ac5-84ca-db0d209a6559',
  slug: 'future-customers',
  title: 'Future customers',
  ...metadata
}

export const collaborationMetadata = {
  id: 'd2feb2b3-bf1c-4639-8108-129a2eb0ea0a',
  slug: 'collaboration',
  title: 'Collaboration',
  ...metadata
}

export const environmentalImpactMetadata = {
  id: 'd5e8404c-73fb-4721-b329-4ab604840e53',
  slug: 'environmental-impact',
  title: 'Environment',
  ...metadata
}

export const scoreResultsMetadata = {
  id: '240dd256-48e5-476a-aec5-492528898405',
  slug: 'score-results',
  title: 'Score results',
  ...metadata
}

export const businessDetailsMetadata = {
  id: 'a6d41baf-17a5-48fc-9aa2-fe5e9246fa48',
  slug: 'business-details',
  title: 'Business Details',
  ...metadata
}

export const whoIsApplyingMetadata = {
  id: 'dac378f9-136b-49d1-8c58-2d4c90d7b1d1',
  slug: 'who-is-applying',
  title: 'Who is applying',
  ...metadata
}

export const agentMetadata = {
  id: '21dc9fc7-15da-419a-b7fd-baa2a7500a18',
  slug: 'agent-details',
  title: 'Agent',
  ...metadata
}

export const applicantMetadata = {
  id: 'f3f08612-a020-44e9-9851-9618820129ff',
  slug: 'applicant-details',
  title: 'Applicant',
  ...metadata
}

export const checkYourDetailsMetadata = {
  id: '9dd81344-0c6b-405c-b345-f7d11cfc05b6',
  slug: 'check-details',
  title: 'Check your details',
  ...metadata
}

export const confirmAndSendMetadata = {
  id: '7ccfcdda-6e8f-4963-be8e-2b16f12d7ebf',
  slug: 'declaration',
  title: 'Confirm and send',
  ...metadata
}

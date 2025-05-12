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

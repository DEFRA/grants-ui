// config of fake applications by ID for local testing
const fakeStatuses = {
  'app-123': {
    crn: '1234567890',
    sbi: '987654321',
    status: 'SUBMITTED',
    applicationReference: 'APP-12345'
  },
  'app-456': {
    crn: '1234567890',
    sbi: '987654321',
    status: 'REJECTED',
    applicationReference: 'APP-45678'
  }
}

export async function getStatusFromGAS(applicationId) {
  // simulate async network delay
  await new Promise((resolve) => setTimeout(resolve, 50))

  return (
    fakeStatuses[applicationId] || {
      crn: 'unknown',
      sbi: 'unknown',
      status: 'UNKNOWN',
      applicationReference: applicationId
    }
  )
}

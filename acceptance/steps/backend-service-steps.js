import https from 'https'
import { Given, Then } from '@wdio/cucumber-framework'
import { getGrantsUiBackendAuthorizationToken } from '../services/backend-auth-helper.js'

// Disable SSL certificate verification for self-signed certificates
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

// Create a custom agent that ignores SSL certificate errors
const httpsAgent = new https.Agent({
  rejectUnauthorized: false
})

Given(
  'there is no application state stored for CRN {string} and SBI {string} and grant {string}',
  async (crn, sbi, grant) => {
    const response = await fetch(`${browser.options.baseBackendUrl}/state?sbi=${sbi}&grantCode=${grant}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Basic ${getGrantsUiBackendAuthorizationToken()}`
      },
      agent: httpsAgent
    })

    await expect(response.status === 200 || response.status === 404).toBe(true)
  }
)

Then(
  'there should be application state stored for CRN {string} and SBI {string} and grant {string}',
  async (crn, sbi, grant) => {
    const response = await fetch(`${browser.options.baseBackendUrl}/state?sbi=${sbi}&grantCode=${grant}`, {
      method: 'GET',
      headers: {
        Authorization: `Basic ${getGrantsUiBackendAuthorizationToken()}`
      },
      agent: httpsAgent
    })

    await expect(response.status === 200).toBe(true)
  }
)

import https from 'https'
import { Given, Then } from '@wdio/cucumber-framework'
import { getGrantsUiBackendAuthorizationToken } from '../services/backend-auth-helper.js'

Given(
  'there is no application state stored for CRN {string} and SBI {string} and grant {string}',
  async (crn, sbi, grant) => {
    const response = await fetch(
      `${browser.options.baseBackendUrl}/state?businessId=${sbi}&userId=${crn}&grantId=${grant}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Basic ${getGrantsUiBackendAuthorizationToken()}`
        },
        agent: new https.Agent({ rejectUnauthorized: false })
      }
    )

    await expect(response.status === 200 || response.status === 404).toBe(true)
  }
)

Then(
  'there should be application state stored for CRN {string} and SBI {string} and grant {string}',
  async (crn, sbi, grant) => {
    const response = await fetch(
      `${browser.options.baseBackendUrl}/state?businessId=${sbi}&userId=${crn}&grantId=${grant}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Basic ${getGrantsUiBackendAuthorizationToken()}`
        }
      }
    )

    await expect(response.status === 200).toBe(true)
  }
)

import https from 'https'
import { Given, Then } from '@wdio/cucumber-framework'
import { getGrantsUiBackendAuthorizationToken } from '../services/backend-auth-helper.js'

Given('there is no application state stored for SBI {string} and grant {string}', async (sbi, grantCode) => {
  const response = await fetch(`${browser.options.baseBackendUrl}/state?sbi=${sbi}&grantCode=${grantCode}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Basic ${getGrantsUiBackendAuthorizationToken()}`
    },
    agent: new https.Agent({ rejectUnauthorized: false })
  })

  await expect(response.status === 200 || response.status === 404).toBe(true)
})

Then('there should be application state stored for SBI {string} and grant {string}', async (sbi, grantCode) => {
  const response = await fetch(`${browser.options.baseBackendUrl}/state?sbi=${sbi}&grantCode=${grantCode}`, {
    method: 'GET',
    headers: {
      Authorization: `Basic ${getGrantsUiBackendAuthorizationToken()}`
    }
  })

  await expect(response.status === 200).toBe(true)
})

import { getBackendAuthorizationToken } from './backend-auth-helper.js'
import { mintLockToken } from './lock-token.js'
import { expect } from '@playwright/test'

class Backend {
  async deleteLock(baseBackendURL, crn, sbi, grantCode) {
    const response = await fetch(
      `${baseBackendURL}/admin/application-lock?ownerId=${crn}&sbi=${sbi}&grantCode=${grantCode}&grantVersion=1`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${getBackendAuthorizationToken()}`
        }
      }
    )
    expect(response.status === 200 || response.status === 404).toBe(true)
  }

  async deleteState(baseBackendURL, crn, sbi, grantCode) {
    const response = await fetch(`${baseBackendURL}/state?sbi=${sbi}&grantCode=${grantCode}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${getBackendAuthorizationToken()}`,
        'x-application-lock-owner': mintLockToken(crn, sbi, grantCode)
      }
    })
    expect(response.status === 200 || response.status === 404).toBe(true)
  }

  async getState(baseBackendURL, crn, sbi, grantCode) {
    const response = await fetch(`${baseBackendURL}/state?sbi=${sbi}&grantCode=${grantCode}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${getBackendAuthorizationToken()}`,
        'x-application-lock-owner': mintLockToken(crn, sbi, grantCode)
      }
    })
    expect(response.status === 200).toBe(true)
    return await response.json()
  }

  async getSubmissions(baseBackendURL, crn, sbi, grantCode) {
    const response = await fetch(`${baseBackendURL}/submissions?sbi=${sbi}&grantCode=${grantCode}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${getBackendAuthorizationToken()}`,
        'x-application-lock-owner': mintLockToken(crn, sbi, grantCode)
      }
    })
    expect(response.status === 200).toBe(true)
    return await response.json()
  }
}

export default new Backend()

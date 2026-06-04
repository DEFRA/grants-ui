import { expect } from '@playwright/test'
import { getBackendAuthorizationToken } from './backend-auth-helper.js'
import { mintLockToken } from './lock-token.js'

const BASE_BACKEND_URL = () => process.env.BASE_BACKEND_URL || 'http://localhost:3001'

class Backend {
  async deleteLock(crn, sbi, grantCode) {
    const response = await fetch(
      `${BASE_BACKEND_URL()}/admin/application-lock?ownerId=${crn}&sbi=${sbi}&grantCode=${grantCode}&grantVersion=1`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${getBackendAuthorizationToken()}`
        }
      }
    )
    expect(response.status === 200 || response.status === 404).toBe(true)
  }

  async deleteState(crn, sbi, grantCode) {
    const response = await fetch(`${BASE_BACKEND_URL()}/state?sbi=${sbi}&grantCode=${grantCode}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${getBackendAuthorizationToken()}`,
        'x-application-lock-owner': mintLockToken(crn, sbi, grantCode)
      }
    })
    expect(response.status === 200 || response.status === 404).toBe(true)
  }

  async getState(crn, sbi, grantCode) {
    const response = await fetch(`${BASE_BACKEND_URL()}/state?sbi=${sbi}&grantCode=${grantCode}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${getBackendAuthorizationToken()}`,
        'x-application-lock-owner': mintLockToken(crn, sbi, grantCode)
      }
    })
    expect(response.status).toBe(200)
    return await response.json()
  }

  async getSubmissions(crn, sbi, grantCode) {
    const response = await fetch(`${BASE_BACKEND_URL()}/submissions?sbi=${sbi}&grantCode=${grantCode}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${getBackendAuthorizationToken()}`,
        'x-application-lock-owner': mintLockToken(crn, sbi, grantCode)
      }
    })
    expect(response.status).toBe(200)
    return await response.json()
  }
}

export default new Backend()

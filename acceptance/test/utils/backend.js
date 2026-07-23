import { expect } from '@playwright/test'
import { getBackendAuthorizationToken } from './backend-auth-helper.js'
import { mintLockToken } from './lock-token.js'

const BASE_BACKEND_URL = () => process.env.BASE_BACKEND_URL

const LOCKED = Symbol('locked')

class Backend {
  /**
   * Probes POST /state/with-definition for a single (crn, sbi, grant) and
   * derives the grant version the backend resolves, mirroring the grants-ui
   * app's own resolution.
   *
   * @returns {Promise<string | undefined | typeof LOCKED>} the version, undefined
   *   when the grant has no backend definition (404), or LOCKED on 423
   */
  async probeGrantVersion(crn, sbi, grantCode) {
    const response = await fetch(`${BASE_BACKEND_URL()}/state/with-definition`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getBackendAuthorizationToken()}`,
        'Content-Type': 'application/json',
        'x-application-lock-owner': mintLockToken(crn, sbi, grantCode)
      },
      body: JSON.stringify({ sbi, grantCode, includeDefinition: true })
    })

    if (response.status === 404) {
      return undefined
    }
    if (response.status === 423) {
      return LOCKED
    }
    expect(response.status).toBe(200)

    const body = await response.json()
    if (body?.upgraded && body.toVersion) {
      return body.toVersion
    }
    if (body?.state?.grantVersion) {
      return body.state.grantVersion
    }
    const definition = body?.definition
    return definition ? `${definition.major}.${definition.minor}.${definition.patch}` : undefined
  }

  /**
   * Resolves the grant version the backend persists state and locks under,
   * mirroring the grants-ui app. Backend-sourced (config-broker) grants are
   * served at their released version (e.g. "1.0.1"); legacy YAML-only grants
   * have no backend definition and resolve to undefined (the backend default
   * applies). When the requested application is locked by another applicant
   * it is resolved from an unlocked probe instead.
   *
   * @returns {Promise<string | undefined>} the resolved version, or undefined
   */
  async resolveGrantVersion(crn, sbi, grantCode) {
    let version = await this.probeGrantVersion(crn, sbi, grantCode)
    if (version === LOCKED) {
      const unlockedSbi = String(Math.floor(900000000 + Math.random() * 99999999))
      version = await this.probeGrantVersion(crn, unlockedSbi, grantCode)
    }
    if (version === LOCKED) {
      version = undefined
    }

    return version
  }

  /**
   * Releases the application lock held by a specific owner (crn), leaving
   * any other user's lock on the same (sbi, grantCode) untouched. Used
   * mid-scenario to unlock one user's session without disturbing another's.
   */
  async deleteLock(crn, sbi, grantCode) {
    const grantVersion = (await this.resolveGrantVersion(crn, sbi, grantCode)) ?? 1
    const response = await fetch(
      `${BASE_BACKEND_URL()}/admin/application-lock?ownerId=${crn}&sbi=${sbi}&grantCode=${grantCode}&grantVersion=${grantVersion}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${getBackendAuthorizationToken()}`
        }
      }
    )
    expect(response.status === 200 || response.status === 404).toBe(true)
  }

  /**
   * Clears all test data (application state, submissions, and locks) for an
   * (sbi, grantCode) pair, across every grantVersion, via the backend's
   * /admin/test-data endpoint. Used as pre-test teardown in place of the
   * older per-resource deleteState/deleteLock calls.
   */
  async clearTestData(sbi, grantCode) {
    const response = await fetch(`${BASE_BACKEND_URL()}/admin/test-data?sbi=${sbi}&grantCode=${grantCode}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${getBackendAuthorizationToken()}`
      }
    })
    expect(response.status).toBe(200)
    return await response.json()
  }

  async getState(crn, sbi, grantCode) {
    const grantVersion = await this.resolveGrantVersion(crn, sbi, grantCode)
    const versionQuery = grantVersion ? `&grantVersion=${grantVersion}` : ''
    const response = await fetch(`${BASE_BACKEND_URL()}/state?sbi=${sbi}&grantCode=${grantCode}${versionQuery}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${getBackendAuthorizationToken()}`,
        'x-application-lock-owner': mintLockToken(crn, sbi, grantCode, grantVersion)
      }
    })
    expect(response.status).toBe(200)
    return await response.json()
  }

  async getSubmissions(crn, sbi, grantCode) {
    // Submissions are queried across all versions: the backend persists them
    // under the submission's own grant version (independent of the live state
    // version), so they must not be filtered by the resolved state version.
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

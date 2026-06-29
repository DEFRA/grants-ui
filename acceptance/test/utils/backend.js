import { expect } from '@playwright/test'
import { getBackendAuthorizationToken } from './backend-auth-helper.js'
import { mintLockToken } from './lock-token.js'

const BASE_BACKEND_URL = () => process.env.BASE_BACKEND_URL || 'http://localhost:3001'

const LOCKED = Symbol('locked')

// The resolved grant version is a grant-level property, so cache it per grant
// code to avoid re-probing the backend on every state/lock operation.
const grantVersionCache = new Map()

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
   * applies). The version is grant-level, so when the requested application is
   * locked by another applicant it is resolved from an unlocked probe instead.
   *
   * @returns {Promise<string | undefined>} the resolved version, or undefined
   */
  async resolveGrantVersion(crn, sbi, grantCode) {
    if (grantVersionCache.has(grantCode)) {
      return grantVersionCache.get(grantCode)
    }

    let version = await this.probeGrantVersion(crn, sbi, grantCode)
    if (version === LOCKED) {
      const unlockedSbi = String(Math.floor(900000000 + Math.random() * 99999999))
      version = await this.probeGrantVersion(crn, unlockedSbi, grantCode)
    }
    if (version === LOCKED) {
      version = undefined
    }

    grantVersionCache.set(grantCode, version)
    return version
  }

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

  async deleteState(crn, sbi, grantCode) {
    const grantVersion = await this.resolveGrantVersion(crn, sbi, grantCode)
    const versionQuery = grantVersion ? `&grantVersion=${grantVersion}` : ''
    const response = await fetch(`${BASE_BACKEND_URL()}/state?sbi=${sbi}&grantCode=${grantCode}${versionQuery}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${getBackendAuthorizationToken()}`,
        'x-application-lock-owner': mintLockToken(crn, sbi, grantCode, grantVersion)
      }
    })
    expect(response.status === 200 || response.status === 404).toBe(true)
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

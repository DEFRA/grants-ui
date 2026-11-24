import { describe, expect, test } from 'vitest'
import { sfdUrlForOrganisation } from './sfd-url.js'

const requestFor = (credentials) => ({ auth: { credentials } })

describe('sfdUrlForOrganisation', () => {
  test.each(['http://localhost:3000/sfd/home', 'https://sfd.example/home', ' https://sfd.example/home '])(
    'adds the selected organisation to %j',
    (configuredUrl) => {
      expect(sfdUrlForOrganisation(configuredUrl, requestFor({ currentRelationshipId: 'REL123' }))).toBe(
        `${configuredUrl.trim()}?ssoOrgId=REL123`
      )
    }
  )

  test.each([
    ['no organisation is selected', {}],
    ['there are no credentials', undefined]
  ])('returns the URL unchanged when %s', (_, credentials) => {
    expect(sfdUrlForOrganisation('https://sfd.example/home', requestFor(credentials))).toBe('https://sfd.example/home')
  })

  test.each([undefined, '', 'not a url', 'javascript:alert(1)', 42])('returns null for %j', (configuredUrl) => {
    expect(sfdUrlForOrganisation(configuredUrl, requestFor({ currentRelationshipId: 'REL123' }))).toBeNull()
  })
})

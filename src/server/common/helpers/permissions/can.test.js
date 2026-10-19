import { describe, it, expect } from 'vitest'
import { can } from './can.js'

describe('can', () => {
  const permissionGroups = [
    {
      id: 'COUNTRYSIDE_STEWARDSHIP_APPLICATIONS',
      level: 'SUBMIT'
    }
  ]

  describe('COUNTRYSIDE_STEWARDSHIP_APPLICATIONS', () => {
    it('should allow submit when level is SUBMIT', () => {
      expect(can(permissionGroups, 'submit', 'csApplications')).toBe(true)
    })

    it('should allow amend when level is SUBMIT', () => {
      expect(can(permissionGroups, 'amend', 'csApplications')).toBe(true)
    })

    it('should allow view when level is SUBMIT', () => {
      expect(can(permissionGroups, 'view', 'csApplications')).toBe(true)
    })
  })

  describe('BUSINESS_DETAILS', () => {
    it.each(['MAKE_LEGAL_CHANGES', 'FULL_PERMISSION'])('allows all actions when level is %s', (level) => {
      const permissionGroups = [{ id: 'BUSINESS_DETAILS', level }]

      expect(can(permissionGroups, 'view', 'businessDetails')).toBe(true)
      expect(can(permissionGroups, 'amend', 'businessDetails')).toBe(true)
      expect(can(permissionGroups, 'submit', 'businessDetails')).toBe(true)
    })

    it.each(['VIEW', 'AMEND', 'SUBMIT', 'NO_ACCESS', 'INVALID'])('denies all actions when level is %s', (level) => {
      const permissionGroups = [{ id: 'BUSINESS_DETAILS', level }]

      expect(can(permissionGroups, 'view', 'businessDetails')).toBe(false)
      expect(can(permissionGroups, 'amend', 'businessDetails')).toBe(false)
      expect(can(permissionGroups, 'submit', 'businessDetails')).toBe(false)
    })

    it('denies access when only Countryside Stewardship permissions are present', () => {
      const permissionGroups = [
        { id: 'COUNTRYSIDE_STEWARDSHIP_APPLICATIONS', level: 'SUBMIT' },
        { id: 'COUNTRYSIDE_STEWARDSHIP_AGREEMENTS', level: 'SUBMIT' }
      ]

      expect(can(permissionGroups, 'submit', 'businessDetails')).toBe(false)
    })
  })

  describe('permission hierarchy', () => {
    it('should allow VIEW when user has VIEW', () => {
      const permissionGroups = [
        {
          id: 'COUNTRYSIDE_STEWARDSHIP_APPLICATIONS',
          level: 'VIEW'
        }
      ]

      expect(can(permissionGroups, 'view', 'csApplications')).toBe(true)
    })

    it('should not allow AMEND when user only has VIEW', () => {
      const permissionGroups = [
        {
          id: 'COUNTRYSIDE_STEWARDSHIP_APPLICATIONS',
          level: 'VIEW'
        }
      ]

      expect(can(permissionGroups, 'amend', 'csApplications')).toBe(false)
    })

    it('should not allow SUBMIT when user only has AMEND', () => {
      const permissionGroups = [
        {
          id: 'COUNTRYSIDE_STEWARDSHIP_APPLICATIONS',
          level: 'AMEND'
        }
      ]

      expect(can(permissionGroups, 'submit', 'csApplications')).toBe(false)
    })

    it('should allow VIEW when user has AMEND', () => {
      const permissionGroups = [
        {
          id: 'COUNTRYSIDE_STEWARDSHIP_APPLICATIONS',
          level: 'AMEND'
        }
      ]

      expect(can(permissionGroups, 'view', 'csApplications')).toBe(true)
    })
  })

  describe('missing or uknown permissions', () => {
    it('should return false for unknown permission level', () => {
      const permissionGroups = [
        {
          id: 'COUNTRYSIDE_STEWARDSHIP_APPLICATIONS',
          level: 'INVALID'
        }
      ]

      expect(can(permissionGroups, 'view', 'csApplications')).toBe(false)
    })
    it('should return false when permission group is missing', () => {
      expect(can(permissionGroups, 'view', 'csAgreements')).toBe(false)
    })
  })

  describe('invalid inputs', () => {
    it('should return false for unknown resource', () => {
      expect(can(permissionGroups, 'view', 'unknownResource')).toBe(false)
    })

    it('should return false for unknown action', () => {
      expect(can(permissionGroups, 'delete', 'csApplications')).toBe(false)
    })

    it('should return false when permissionGroups is empty', () => {
      expect(can([], 'view', 'csApplications')).toBe(false)
    })
  })
})

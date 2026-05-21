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

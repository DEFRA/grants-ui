import { describe, it, expect } from 'vitest'
import { can } from './can.js'

describe('can', () => {
  const permissionGroups = [
    {
      id: 'COUNTRYSIDE_STEWARDSHIP_APPLICATIONS',
      level: 'SUBMIT'
    },
    {
      id: 'LAND_DETAILS',
      level: 'AMEND'
    },
    {
      id: 'BUSINESS_DETAILS',
      level: 'FULL_PERMISSION'
    },
    {
      id: 'ENVIRONMENTAL_LAND_MANAGEMENT_APPLICATIONS',
      level: 'NO_ACCESS'
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

  describe('LAND_DETAILS', () => {
    it('should allow amend when level is AMEND', () => {
      expect(can(permissionGroups, 'amend', 'landDetails')).toBe(true)
    })

    it('should allow view when level is AMEND', () => {
      expect(can(permissionGroups, 'view', 'landDetails')).toBe(true)
    })

    it('should deny submit when level is AMEND', () => {
      expect(can(permissionGroups, 'submit', 'landDetails')).toBe(false)
    })
  })

  describe('BUSINESS_DETAILS', () => {
    it('should allow submit when level is FULL_PERMISSION', () => {
      expect(can(permissionGroups, 'submit', 'businessDetails')).toBe(true)
    })

    it('should allow amend when level is FULL_PERMISSION', () => {
      expect(can(permissionGroups, 'amend', 'businessDetails')).toBe(true)
    })

    it('should allow view when level is FULL_PERMISSION', () => {
      expect(can(permissionGroups, 'view', 'businessDetails')).toBe(true)
    })
  })

  describe('NO_ACCESS permissions', () => {
    it('should deny view when level is NO_ACCESS', () => {
      expect(can(permissionGroups, 'view', 'elmApplications')).toBe(false)
    })

    it('should deny amend when level is NO_ACCESS', () => {
      expect(can(permissionGroups, 'amend', 'elmApplications')).toBe(false)
    })

    it('should deny submit when level is NO_ACCESS', () => {
      expect(can(permissionGroups, 'submit', 'elmApplications')).toBe(false)
    })
  })

  describe('missing permissions', () => {
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

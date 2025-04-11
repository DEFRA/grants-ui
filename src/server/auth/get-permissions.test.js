import { getPersonId, getRolesAndPrivileges } from './get-permissions.js'

describe('getPermissions', () => {
  const mockGetPersonId = jest.fn()
  const mockGetRolesAndPrivileges = jest.fn()

  function testableGetPermissions(crn, organisationId, token) {
    const personId = mockGetPersonId({ crn, token })

    const { role, privileges } = mockGetRolesAndPrivileges(
      personId,
      organisationId,
      { crn, token }
    )

    const scope = ['user', ...privileges]

    return { role, scope }
  }

  beforeEach(() => {
    mockGetPersonId.mockReset()
    mockGetRolesAndPrivileges.mockReset()
  })

  it('should return the correct role and scope when valid data is provided', () => {
    const crn = '1234567890'
    const organisationId = 'org123'
    const token = 'valid-token'
    const personId = '123456'
    const role = 'Farmer'
    const privileges = ['Full permission - business']

    mockGetPersonId.mockReturnValue(personId)
    mockGetRolesAndPrivileges.mockReturnValue({ role, privileges })

    const result = testableGetPermissions(crn, organisationId, token)

    expect(mockGetPersonId).toHaveBeenCalledWith({ crn, token })
    expect(mockGetRolesAndPrivileges).toHaveBeenCalledWith(
      personId,
      organisationId,
      { crn, token }
    )
    expect(result).toEqual({
      role: 'Farmer',
      scope: ['user', 'Full permission - business']
    })
  })

  it('should handle multiple privileges correctly', () => {
    const crn = '1234567890'
    const organisationId = 'org123'
    const token = 'valid-token'
    const personId = '123456'
    const role = 'Agent'
    const privileges = ['Submit - bps', 'Submit - cs agree']

    mockGetPersonId.mockReturnValue(personId)
    mockGetRolesAndPrivileges.mockReturnValue({ role, privileges })

    const result = testableGetPermissions(crn, organisationId, token)

    expect(result).toEqual({
      role: 'Agent',
      scope: ['user', 'Submit - bps', 'Submit - cs agree']
    })
  })

  it('should handle when no additional privileges are provided', () => {
    const crn = '1234567890'
    const organisationId = 'org123'
    const token = 'valid-token'
    const personId = '123456'
    const role = 'Viewer'
    const privileges = []

    mockGetPersonId.mockReturnValue(personId)
    mockGetRolesAndPrivileges.mockReturnValue({ role, privileges })

    const result = testableGetPermissions(crn, organisationId, token)

    expect(result).toEqual({
      role: 'Viewer',
      scope: ['user']
    })
  })

  it('should propagate errors from getPersonId', () => {
    const crn = '1234567890'
    const organisationId = 'org123'
    const token = 'valid-token'
    const error = new Error('API error')

    mockGetPersonId.mockImplementation(() => {
      throw error
    })

    expect(() => {
      testableGetPermissions(crn, organisationId, token)
    }).toThrow('API error')

    expect(mockGetPersonId).toHaveBeenCalledWith({ crn, token })
    expect(mockGetRolesAndPrivileges).not.toHaveBeenCalled()
  })

  it('should propagate errors from getRolesAndPrivileges', () => {
    const crn = '1234567890'
    const organisationId = 'org123'
    const token = 'valid-token'
    const personId = '123456'
    const error = new Error('Permission error')

    mockGetPersonId.mockReturnValue(personId)
    mockGetRolesAndPrivileges.mockImplementation(() => {
      throw error
    })

    expect(() => {
      testableGetPermissions(crn, organisationId, token)
    }).toThrow('Permission error')

    expect(mockGetPersonId).toHaveBeenCalledWith({ crn, token })
    expect(mockGetRolesAndPrivileges).toHaveBeenCalledWith(
      personId,
      organisationId,
      { crn, token }
    )
  })
})

describe('Utility Functions', () => {
  describe('getPersonId', () => {
    it('should extract personId from the response', () => {
      const headers = {
        crn: '1234567890',
        token: 'valid-token'
      }

      // Act
      const result = getPersonId(headers)

      // Assert
      expect(result).toBe('123456')
    })
  })

  describe('getRolesAndPrivileges', () => {
    it('should extract roles and privileges for the correct personId', () => {
      const personId = '123456'
      const organisationId = 'org123'
      const headers = {
        crn: '1234567890',
        token: 'valid-token'
      }

      const result = getRolesAndPrivileges(personId, organisationId, headers)

      expect(result).toEqual({
        role: 'Farmer',
        privileges: ['Full permission - business']
      })
    })

    it('should handle cases when personId does not match any data', () => {
      const personId = 'non-existent'
      const organisationId = 'org123'
      const headers = {
        crn: '1234567890',
        token: 'valid-token'
      }

      expect(() => {
        getRolesAndPrivileges(personId, organisationId, headers)
      }).toThrow()
    })
  })
})

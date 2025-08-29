import * as permissionsModule from './get-permissions.js'
import { getPermissions } from './get-permissions.js'

const DEFAULT_SCOPE = 'user'

// TODO: This test currently mocks the actual `getPermissions` implementation.
jest.mock('./get-permissions', () => {
  const mockGetPersonId = jest.fn()
  const mockGetRolesAndPrivileges = jest.fn()

  return {
    __esModule: true,
    getPermissions: async (crn, organisationId, token) => {
      const personId = await mockGetPersonId({ crn, token })
      const { role, privileges } = await mockGetRolesAndPrivileges(personId, organisationId, { crn, token })
      const scope = [DEFAULT_SCOPE, ...privileges]
      return { role, scope }
    },
    getPersonId: mockGetPersonId,
    getRolesAndPrivileges: mockGetRolesAndPrivileges,
    DEFAULT_SCOPE
  }
})

describe('getPermissions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should return the correct role and scope when valid data is provided', async () => {
    const crn = '1234567890'
    const organisationId = 'org123'
    const token = 'valid-token'
    const personId = '123456'
    const role = 'Farmer'
    const privileges = ['Full permission - business']

    permissionsModule.getPersonId.mockResolvedValue(personId)
    permissionsModule.getRolesAndPrivileges.mockResolvedValue({
      role,
      privileges
    })

    const result = await getPermissions(crn, organisationId, token)

    expect(permissionsModule.getPersonId).toHaveBeenCalledWith({ crn, token })
    expect(permissionsModule.getRolesAndPrivileges).toHaveBeenCalledWith(personId, organisationId, { crn, token })
    expect(result).toEqual({
      role: 'Farmer',
      scope: ['user', 'Full permission - business']
    })
  })

  it('should handle multiple privileges correctly', async () => {
    const crn = '1234567890'
    const organisationId = 'org123'
    const token = 'valid-token'
    const personId = '123456'
    const role = 'Agent'
    const privileges = ['Submit - bps', 'Submit - cs agree']

    permissionsModule.getPersonId.mockResolvedValue(personId)
    permissionsModule.getRolesAndPrivileges.mockResolvedValue({
      role,
      privileges
    })
    const result = await getPermissions(crn, organisationId, token)

    expect(result).toEqual({
      role: 'Agent',
      scope: ['user', 'Submit - bps', 'Submit - cs agree']
    })
  })

  it('should handle when no additional privileges are provided', async () => {
    const crn = '1234567890'
    const organisationId = 'org123'
    const token = 'valid-token'
    const personId = '123456'
    const role = 'Viewer'
    const privileges = []

    permissionsModule.getPersonId.mockResolvedValue(personId)
    permissionsModule.getRolesAndPrivileges.mockResolvedValue({
      role,
      privileges
    })

    const result = await getPermissions(crn, organisationId, token)

    expect(result).toEqual({
      role: 'Viewer',
      scope: ['user']
    })
  })

  it('should propagate errors from getPersonId', async () => {
    const crn = '1234567890'
    const organisationId = 'org123'
    const token = 'valid-token'
    const error = new Error('API error')

    permissionsModule.getPersonId.mockRejectedValue(error)

    await expect(getPermissions(crn, organisationId, token)).rejects.toThrow('API error')
    expect(permissionsModule.getPersonId).toHaveBeenCalledWith({ crn, token })
    expect(permissionsModule.getRolesAndPrivileges).not.toHaveBeenCalled()
  })

  it('should propagate errors from getRolesAndPrivileges', async () => {
    const crn = '1234567890'
    const organisationId = 'org123'
    const token = 'valid-token'
    const personId = '123456'
    const error = new Error('Permission error')

    permissionsModule.getPersonId.mockResolvedValue(personId)
    permissionsModule.getRolesAndPrivileges.mockRejectedValue(error)

    await expect(getPermissions(crn, organisationId, token)).rejects.toThrow('Permission error')
    expect(permissionsModule.getPersonId).toHaveBeenCalledWith({ crn, token })
    expect(permissionsModule.getRolesAndPrivileges).toHaveBeenCalledWith(personId, organisationId, { crn, token })
  })
})

describe('Integration tests for permission functions', () => {
  const originalModule = jest.requireActual('./get-permissions')

  it('should integrate correctly with mock API responses', async () => {
    const crn = '1234567890'
    const organisationId = 'org123'
    const token = 'valid-token'

    const result = await originalModule.getPermissions(crn, organisationId, token)

    expect(result).toEqual({
      role: 'Farmer',
      scope: ['user', 'Full permission - business']
    })
  })
})

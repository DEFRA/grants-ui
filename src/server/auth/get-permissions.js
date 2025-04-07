const DEFAULT_SCOPE = 'user'

async function getPermissions (crn, organisationId, token) {
  // Cannot be retrieved in a single call so need to make multiple calls to different APIs
  // These calls are authenticated using the token returned from Defra Identity
  // All APIs are accessible via a series of RESTful endpoints hosted in Crown Hosting
  // For the purposes of this example, we will simulate these calls using mock data
  // 1. Get personId from RPS API
  const personId = await getPersonId({ crn, token })
  // 2. Get roles and privileges from Siti Agri API
  const { role, privileges } = await getRolesAndPrivileges(personId, organisationId, { crn, token })
  // 3. Map roles and privileges to scope
  // An application specific permission is added to demonstrate how to add local, non-Siti Agri permissions
  const scope = [DEFAULT_SCOPE, ...privileges]
  // Hapi.js assumes permissions are added in a `scope` array
  return { role, scope }
}

async function getPersonId (headers) {
  // simulate call to RPS API
  // Only id is needed for mapping roles, but other fields shown for context for what else is available
  // PATH: /person/3337243/summary
  // METHOD: GET
  // HEADERS:
  //   crn: <headers.crn>
  //   Authorization <headers.token>

  const mockResponse = {
    _data: {
      id: '123456',
      customerReferenceNumber: '1234567890', // crn
      title: 'Mr',
      firstName: 'Andrew',
      lastName: 'Farmer',
      landline: '01234567890',
      mobile: '01234567890',
      email: 'a.farmer@farms.com',
      address: {
        address1: 'Address line 1',
        address2: 'Address line 2',
        address3: 'Address line 3',
        address4: 'Address line 4',
        address5: 'Address line 5',
        city: 'City',
        county: 'County',
        postcode: 'FA1 1RM',
        country: 'UK'
      },
      doNotContact: false,
      locked: false
    }
  }

  return mockResponse._data.id
}

async function getRolesAndPrivileges (personId, organisationId, { headers }) {
  // simulate call to Siti Agri API
  // returns all roles and privileges for so need to filter for logged in user
  // PATH: /SitiAgriApi/authorisation/organisation/<organisationId>/authorisation
  // METHOD: GET
  // HEADERS:
  //   crn: <headers.crn>
  //   Authorization <headers.token>

  const mockResponse = {
    data: {
      personRoles: [{
        personId: '123456',
        role: 'Farmer'
      }, {
        personId: '654321',
        role: 'Agent'
      }],
      personPrivileges: [{
        personId: '123456',
        privilegeNames: ['Full permission - business']
      }, {
        personId: '654321',
        privilegeNames: ['Submit - bps']
      }, {
        personId: '654321',
        privilegeNames: ['Submit - cs agree']
      }]
    }
  }

  return {
    role: mockResponse.data.personRoles.find(role => role.personId === '123456').role,
    privileges: mockResponse.data.personPrivileges.filter(privilege => privilege.personId === '123456').map(privilege => privilege.privilegeNames[0])
  }
}

export { getPermissions }

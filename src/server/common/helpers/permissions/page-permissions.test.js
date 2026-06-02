import { getPermissionConfig, getPermissionResource, getRequiredPermission } from './page-permissions.js'

describe('page-permissions', () => {
  describe('#getPermissionConfig', () => {
    test('returns permissions config from request model metadata', () => {
      const permissions = {
        pageAccess: {
          default: 'amend'
        }
      }

      const request = {
        app: {
          model: {
            def: {
              metadata: {
                permissions
              }
            }
          }
        }
      }

      expect(getPermissionConfig(request)).toEqual(permissions)
    })

    test('returns undefined when permissions config does not exist', () => {
      const request = {
        app: {
          model: {
            def: {
              metadata: {}
            }
          }
        }
      }

      expect(getPermissionConfig(request)).toBeUndefined()
    })
  })

  describe('#getRequiredPermission', () => {
    test('returns matching rule permission when path matches', () => {
      const request = {
        params: {
          path: '/declaration'
        },
        app: {
          model: {
            def: {
              metadata: {
                permissions: {
                  pageAccess: {
                    default: 'amend',
                    rules: [
                      {
                        paths: ['/declaration'],
                        permission: 'submit'
                      }
                    ]
                  }
                }
              }
            }
          }
        }
      }

      expect(getRequiredPermission(request)).toBe('submit')
    })

    test('returns default permission when no rule matches', () => {
      const request = {
        params: {
          path: '/check-details'
        },
        app: {
          model: {
            def: {
              metadata: {
                permissions: {
                  pageAccess: {
                    default: 'amend',
                    rules: [
                      {
                        paths: ['/declaration'],
                        permission: 'submit'
                      }
                    ]
                  }
                }
              }
            }
          }
        }
      }

      expect(getRequiredPermission(request)).toBe('amend')
    })

    test('returns default permission when rules are missing', () => {
      const request = {
        params: {
          path: '/check-details'
        },
        app: {
          model: {
            def: {
              metadata: {
                permissions: {
                  pageAccess: {
                    default: 'view'
                  }
                }
              }
            }
          }
        }
      }

      expect(getRequiredPermission(request)).toBe('view')
    })

    test('returns undefined when permissions config is missing', () => {
      const request = {
        params: {
          path: '/check-details'
        },
        app: {
          model: {
            def: {
              metadata: {}
            }
          }
        }
      }

      expect(getRequiredPermission(request)).toBeUndefined()
    })
  })

  describe('#getPermissionResource', () => {
    test('returns configured resource', () => {
      const request = {
        app: {
          model: {
            def: {
              metadata: {
                permissions: {
                  resource: 'sfiApplications'
                }
              }
            }
          }
        }
      }

      expect(getPermissionResource(request)).toBe('sfiApplications')
    })

    test('throws when resource is missing', () => {
      const request = {
        params: {
          slug: 'grantCode'
        },
        app: {
          model: {
            def: {
              metadata: {
                permissions: {}
              }
            }
          }
        }
      }

      expect(() => getPermissionResource(request)).toThrow(
        'Permission enforcement enabled but no resource configured for grant grantCode'
      )
    })

    test('throws when permissions config is missing', () => {
      const request = {
        app: {
          model: {
            def: {
              metadata: {}
            }
          }
        }
      }

      expect(() => getPermissionResource(request)).toThrow('Permission config missing')
    })
  })
})

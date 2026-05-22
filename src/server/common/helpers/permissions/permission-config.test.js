import { describe, test, expect } from 'vitest'

import { isPermissionEnforced } from './permission-config.js'

describe('isPermissionEnforced', () => {
  test('returns true when permissions config is missing', () => {
    const request = {
      app: {
        model: {
          def: {
            metadata: {}
          }
        }
      }
    }

    expect(isPermissionEnforced(request)).toBe(true)
  })

  test('returns true when permissions object is missing', () => {
    const request = {
      app: {
        model: {
          def: {
            metadata: {}
          }
        }
      }
    }

    expect(isPermissionEnforced(request)).toBe(true)
  })

  test('returns true when enforce is true', () => {
    const request = {
      app: {
        model: {
          def: {
            metadata: {
              permissions: {
                enforce: true
              }
            }
          }
        }
      }
    }

    expect(isPermissionEnforced(request)).toBe(true)
  })

  test('returns false when enforce is false', () => {
    const request = {
      app: {
        model: {
          def: {
            metadata: {
              permissions: {
                enforce: false
              }
            }
          }
        }
      }
    }

    expect(isPermissionEnforced(request)).toBe(false)
  })

  test('returns true when request shape is incomplete', () => {
    expect(isPermissionEnforced({})).toBe(true)
  })
})

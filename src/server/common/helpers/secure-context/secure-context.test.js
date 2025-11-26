import { vi, beforeEach, afterEach, describe, test, expect, beforeAll, afterAll } from 'vitest'
import hapi from '@hapi/hapi'

import { secureContext } from '~/src/server/common/helpers/secure-context/secure-context.js'
import { requestLogger } from '~/src/server/common/helpers/logging/request-logger.js'
import { config } from '~/src/config/config.js'

vi.mock('hapi-pino', async () => {
  const { mockHapiPino } = await import('~/src/__mocks__')
  const hapiPino = mockHapiPino()
  return {
    default: hapiPino,
    ...hapiPino
  }
})

vi.mock('node:tls', () => {
  const mockAddCACert = vi.fn()
  return {
    createSecureContext: vi.fn().mockReturnValue({
      context: {
        addCACert: mockAddCACert
      }
    }),
    default: {
      createSecureContext: vi.fn().mockReturnValue({
        context: {
          addCACert: mockAddCACert
        }
      })
    }
  }
})

vi.mock('~/src/server/common/helpers/logging/log.js', () => ({
  log: vi.fn()
}))

describe('#secureContext', () => {
  let server

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('When secure context is disabled', () => {
    beforeEach(async () => {
      config.set('isSecureContextEnabled', false)
      server = hapi.server()
      await server.register([requestLogger, secureContext])
    })

    afterEach(async () => {
      config.set('isSecureContextEnabled', false)
      await server.stop({ timeout: 0 })
    })

    test('secureContext decorator should not be available', () => {
      expect(server.logger.info).toHaveBeenCalledWith('Custom secure context is disabled')
    })

    test('Logger should give us disabled message', () => {
      expect(server.secureContext).toBeUndefined()
    })
  })

  describe('When secure context is enabled', () => {
    const PROCESS_ENV = process.env

    beforeAll(() => {
      process.env = { ...PROCESS_ENV }
      process.env.TRUSTSTORE_ONE = 'bW9jay10cnVzdC1zdG9yZS1jZXJ0LW9uZQ==' // base64 encoded "mock-trust-store-cert-one"
    })

    beforeEach(async () => {
      config.set('isSecureContextEnabled', true)
      server = hapi.server()
      await server.register([requestLogger, secureContext])
    })

    afterEach(async () => {
      config.set('isSecureContextEnabled', false)
      await server.stop({ timeout: 0 })
    })

    afterAll(() => {
      process.env = PROCESS_ENV
    })

    test('Should not log about missing TRUSTSTORE_ certs when they exist', () => {
      expect(server.logger.info).not.toHaveBeenCalledWith('Could not find any TRUSTSTORE_ certificates')
    })

    test('secureContext decorator should be available', () => {
      expect(server.secureContext).toBeDefined()
      expect(server.secureContext.context).toBeDefined()
      expect(server.secureContext.context.addCACert).toBeTypeOf('function')
    })

    test('Should initialize secure context with trust store certs', () => {
      expect(server.registrations['secure-context']).toBeDefined()
    })
  })

  describe('When secure context is enabled without TRUSTSTORE_ certs', () => {
    beforeEach(async () => {
      config.set('isSecureContextEnabled', true)
      server = hapi.server()
      await server.register([requestLogger, secureContext])
    })

    afterEach(async () => {
      config.set('isSecureContextEnabled', false)
      await server.stop({ timeout: 0 })
    })

    test('Should log about not finding any TRUSTSTORE_ certs', () => {
      expect(server.logger.info).toHaveBeenCalledWith('Could not find any TRUSTSTORE_ certificates')
    })
  })
})

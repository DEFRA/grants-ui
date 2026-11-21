import { validateNumberFormats } from './validate-number-formats.js'
import { SystemError } from '../utils/errors/SystemError.js'
import { configureFormDefinition, hoistPageConfig } from './services/form.js'
import { LogCodes } from '../helpers/logging/log-codes.js'
import { catchAll } from '../helpers/errors.js'
import { log } from '../helpers/logging/log.js'

const definition = (component) => ({ pages: [{ components: [component] }] })

describe('number display formatting configuration', () => {
  it.each([
    { format: 'suffix', suffix: 'm³' },
    { format: 'suffix' },
    { format: 'thousands|suffix', suffix: 'm³' },
    { format: 'decimal:2|suffix', suffix: 'ha' },
    { format: 'currency:gbp,2|suffix', suffix: ' per year' },
    { format: 'thousands|suffix' }
  ])('accepts suffix formatting with or without a suffix: %j', (options) => {
    expect(() => validateNumberFormats(definition({ type: 'NumberField', name: 'capacity', options }))).not.toThrow()
  })

  it.each([
    { type: 'TextField', name: 'reference', options: { format: 'thousands' } },
    { type: 'NumberField', name: 'capacity', options: { format: 'currency:invalid' } },
    { type: 'NumberField', name: 'capacity', options: { format: null } },
    { type: 'NumberField', name: 'capacity', options: { format: 'thousands|prefix' } },
    { type: 'NumberField', name: 'capacity', options: { format: 'thousands|suffix|suffix' } },
    { type: 'NumberField', name: 'capacity', options: { format: 'suffix|suffix' } },
    { type: 'NumberField', name: 'capacity', options: { format: '|suffix' } },
    { type: 'NumberField', name: 'capacity', format: 'thousands', options: { format: 'decimal' } },
    { type: 'NumberField', name: 'capacity', schema: { format: 'thousands' }, options: { format: 'decimal' } }
  ])('rejects invalid formatting as a configuration error: %j', (component) => {
    expect(() => validateNumberFormats(definition(component))).toThrow(SystemError)
  })

  it('validates number fields inside conditional list items', () => {
    const form = {
      lists: [
        {
          items: [
            {
              conditional: { components: [{ type: 'TextField', name: 'reference', options: { format: 'thousands' } }] }
            }
          ]
        }
      ]
    }
    expect(() => validateNumberFormats(form)).toThrow(SystemError)
  })

  describe.each([false, true])('additional answers with hoisted page config: %s', (hoisted) => {
    const additionalAnswersDefinition = (format) => {
      const form = {
        pages: [
          {
            path: '/summary',
            config: {
              additionalSections: [{ items: [{ title: 'Cost', stateValue: 'additionalAnswers.cost', format }] }]
            }
          }
        ]
      }
      return hoisted ? hoistPageConfig(form) : form
    }

    it.each([undefined, 'thousands', 'decimal', 'decimal:4', 'currency:gbp', 'currency:gbp,4'])(
      'accepts supported or omitted format %s',
      (format) => {
        expect(() => configureFormDefinition(additionalAnswersDefinition(format))).not.toThrow()
      }
    )

    it.each([null, '', 2, 'unknown', 'thousands:2', 'decimal:-1', 'currency:invalid'])(
      'rejects invalid format %s with the standard server error policy',
      (format) => {
        expect(() => configureFormDefinition(additionalAnswersDefinition(format))).toThrow(
          expect.objectContaining({
            message: 'Invalid display formatting for additional answer additionalAnswers.cost on page /summary',
            details: expect.objectContaining({ status: 500, source: 'validateNumberFormats' }),
            logCode: LogCodes.SYSTEM.SERVER_ERROR
          })
        )
      }
    )

    it('renders the server error page and logs invalid configuration once at the global handler', () => {
      vi.mocked(log).mockClear()
      const configure = vi.fn(() => configureFormDefinition(additionalAnswersDefinition('unknown')))
      expect(configure).toThrow(SystemError)
      expect(log).not.toHaveBeenCalled()

      const request = { response: configure.mock.results[0].value }
      const toolkit = {
        view: vi.fn().mockReturnThis(),
        code: vi.fn().mockReturnThis(),
        request: { app: { model: null } }
      }
      catchAll(request, toolkit)

      expect(toolkit.view).toHaveBeenCalledWith('errors/500', { supportEmail: null })
      expect(toolkit.code).toHaveBeenCalledWith(500)
      expect(log).toHaveBeenCalledExactlyOnceWith(
        LogCodes.SYSTEM.SERVER_ERROR,
        expect.objectContaining({ source: 'validateNumberFormats', status: 500 }),
        request
      )
    })
  })
})

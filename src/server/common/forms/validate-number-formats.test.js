import { validateNumberFormats } from './validate-number-formats.js'
import { SystemError } from '../utils/errors/SystemError.js'

const definition = (component) => ({ pages: [{ components: [component] }] })

describe('number playback configuration', () => {
  it.each([
    { type: 'TextField', name: 'reference', schema: { format: 'thousands' } },
    { type: 'NumberField', name: 'capacity', schema: { format: 'currency' } },
    { type: 'NumberField', name: 'capacity', schema: { format: 'currency:invalid' } },
    { type: 'NumberField', name: 'capacity', schema: { format: 'constructor' } },
    { type: 'NumberField', name: 'capacity', schema: { format: '__proto__' } },
    { type: 'TextField', name: 'reference', schema: { format: 'percent' } },
    { type: 'TextField', name: 'reference', schema: { format: 'decimal' } },
    { type: 'TextField', name: 'reference', schema: { format: 'currency:gbp,4' } },
    { type: 'NumberField', name: 'capacity', schema: { format: 'decimal:4|currency:gbp' } },
    { type: 'NumberField', name: 'capacity', schema: { format: null } },
    { type: 'NumberField', name: 'capacity', format: 'thousands' },
    { type: 'NumberField', name: 'capacity', format: 'thousands', schema: { format: 'decimal' } }
  ])('rejects invalid formatting as a configuration error: %j', (component) => {
    expect(() => validateNumberFormats(definition(component))).toThrow(SystemError)
  })

  it.each(['thousands', 'percent:4', 'decimal:4', 'currency:gbp,4'])(
    'rejects %s formatting on a repeating page',
    (format) => {
      const form = definition({ type: 'NumberField', name: 'amount', schema: { format } })
      form.pages[0].repeat = { options: { name: 'items' } }
      expect(() => validateNumberFormats(form)).toThrow(SystemError)
    }
  )

  it('validates number fields inside conditional list items', () => {
    const form = {
      lists: [
        {
          items: [
            { conditional: { components: [{ type: 'TextField', name: 'reference', schema: { format: 'thousands' } }] } }
          ]
        }
      ]
    }
    expect(() => validateNumberFormats(form)).toThrow(SystemError)
  })
})

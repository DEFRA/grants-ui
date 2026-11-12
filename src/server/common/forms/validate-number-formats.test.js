import { validateNumberFormats } from './validate-number-formats.js'
import { SystemError } from '../utils/errors/SystemError.js'

const definition = (component) => ({ pages: [{ components: [component] }] })

describe('number playback configuration', () => {
  it.each([
    { type: 'TextField', name: 'reference', options: { format: 'thousands' } },
    { type: 'NumberField', name: 'capacity', options: { format: 'currency' } },
    { type: 'NumberField', name: 'capacity', options: { format: 'currency:invalid' } },
    { type: 'NumberField', name: 'capacity', options: { format: 'constructor' } },
    { type: 'NumberField', name: 'capacity', options: { format: '__proto__' } },
    { type: 'NumberField', name: 'capacity', options: { format: 'percent' } },
    { type: 'NumberField', name: 'capacity', options: { format: 'percent:4' } },
    { type: 'TextField', name: 'reference', options: { format: 'decimal' } },
    { type: 'TextField', name: 'reference', options: { format: 'currency:gbp,4' } },
    { type: 'NumberField', name: 'capacity', options: { format: 'decimal:4|currency:gbp' } },
    { type: 'NumberField', name: 'capacity', options: { format: null } },
    { type: 'NumberField', name: 'capacity', format: 'thousands' },
    { type: 'NumberField', name: 'capacity', format: 'thousands', options: { format: 'decimal' } },
    { type: 'NumberField', name: 'capacity', schema: { format: 'thousands' } },
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
})

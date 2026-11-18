import { validateNumberFormats } from './validate-number-formats.js'
import { SystemError } from '../utils/errors/SystemError.js'

const definition = (component) => ({ pages: [{ components: [component] }] })

describe('number display formatting configuration', () => {
  it.each([
    { format: 'thousands|suffix', suffix: 'm³' },
    { format: 'decimal:2|suffix', suffix: 'ha' },
    { format: 'currency:gbp,2|suffix', suffix: ' per year' },
    { format: 'thousands|suffix' }
  ])('accepts the suffix modifier with or without a suffix: %j', (options) => {
    expect(() => validateNumberFormats(definition({ type: 'NumberField', name: 'capacity', options }))).not.toThrow()
  })

  it.each([
    { type: 'TextField', name: 'reference', options: { format: 'thousands' } },
    { type: 'NumberField', name: 'capacity', options: { format: 'currency:invalid' } },
    { type: 'NumberField', name: 'capacity', options: { format: null } },
    { type: 'NumberField', name: 'capacity', options: { format: 'thousands|prefix' } },
    { type: 'NumberField', name: 'capacity', options: { format: 'thousands|suffix|suffix' } },
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
})

import { validateNumberFormats } from './validate-number-formats.js'
import { SystemError } from '../utils/errors/SystemError.js'

const definition = (component) => ({ pages: [{ components: [component] }] })

describe('number playback configuration', () => {
  it.each([
    { type: 'TextField', name: 'reference', format: 'thousands' },
    { type: 'NumberField', name: 'capacity', format: 'currency' },
    { type: 'NumberField', name: 'capacity', format: 'currency:invalid' },
    { type: 'NumberField', name: 'capacity', format: 'constructor' },
    { type: 'NumberField', name: 'capacity', format: '__proto__' },
    { type: 'TextField', name: 'reference', format: 'percent' },
    { type: 'TextField', name: 'reference', format: 'decimal' },
    { type: 'TextField', name: 'reference', format: 'decimal:4|currency:gbp' },
    { type: 'NumberField', name: 'capacity', format: null }
  ])('rejects invalid formatting as a configuration error: $type / $format', (component) => {
    expect(() => validateNumberFormats(definition(component))).toThrow(SystemError)
  })

  it.each(['thousands', 'percent:4', 'decimal:4', 'currency:gbp,4', 'decimal:4|currency:gbp'])(
    'rejects %s formatting on a repeating page',
    (format) => {
      const form = definition({ type: 'NumberField', name: 'amount', format })
      form.pages[0].repeat = { options: { name: 'items' } }
      expect(() => validateNumberFormats(form)).toThrow(SystemError)
    }
  )

  it('validates number fields inside conditional list items', () => {
    const form = {
      lists: [
        { items: [{ conditional: { components: [{ type: 'TextField', name: 'reference', format: 'thousands' }] } }] }
      ]
    }
    expect(() => validateNumberFormats(form)).toThrow(SystemError)
  })
})

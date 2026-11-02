import { validateNumberFormats } from './validate-number-formats.js'
import { SystemError } from '../utils/errors/SystemError.js'

const definition = (component) => ({ pages: [{ components: [component] }] })

describe('number playback configuration', () => {
  it.each([
    { type: 'TextField', name: 'reference', format: 'thousands' },
    { type: 'NumberField', name: 'capacity', format: 'currency' },
    { type: 'NumberField', name: 'capacity', format: null }
  ])('rejects invalid formatting as a configuration error: $type / $format', (component) => {
    expect(() => validateNumberFormats(definition(component))).toThrow(SystemError)
    expect(() => validateNumberFormats(definition(component))).toThrow(
      `Invalid playback format for component '${component.name}'`
    )
  })

  it('rejects playback formatting on a repeating page', () => {
    const form = definition({ type: 'NumberField', name: 'amount', format: 'thousands' })
    form.pages[0].repeat = { options: { name: 'items' } }
    expect(() => validateNumberFormats(form)).toThrow(SystemError)
  })

  it('validates number fields inside conditional list items', () => {
    const form = {
      lists: [
        { items: [{ conditional: { components: [{ type: 'TextField', name: 'reference', format: 'thousands' }] } }] }
      ]
    }
    expect(() => validateNumberFormats(form)).toThrow(SystemError)
  })
})

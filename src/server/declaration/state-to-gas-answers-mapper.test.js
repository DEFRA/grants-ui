import { transformAnswerKeysToText } from './state-to-gas-answers-mapper.js'

describe('transformAnswerKeysToText', () => {
  const listDefMap = new Map([
    [
      'schemeList',
      {
        items: [
          { value: 'scheme-1', text: 'Scheme One' },
          { value: 'scheme-2', text: 'Scheme Two' }
        ]
      }
    ],
    [
      'actionCodeList',
      {
        items: [
          { value: 'code-1', text: 'Action Code One' },
          { value: 'code-2', text: 'Action Code Two' }
        ]
      }
    ]
  ])

  const componentDefMap = new Map([
    ['scheme', { list: 'schemeList' }],
    ['applicantFirstName', {}],
    ['isInEngland', {}],
    ['code', { list: 'actionCodeList' }]
  ])

  it('should transform single list fields into text', () => {
    const state = { scheme: 'scheme-1' }
    const result = transformAnswerKeysToText(state, componentDefMap, listDefMap)
    expect(result.scheme).toBe('Scheme One')
  })

  it('should transform non-list fields as-is', () => {
    const state = { applicantFirstName: 'John', isInEngland: true }
    const result = transformAnswerKeysToText(state, componentDefMap, listDefMap)
    expect(result.applicantFirstName).toBe('John')
    expect(result.isInEngland).toBe(true)
  })

  it('should handle array fields (checkbox style) into array of text', () => {
    const extendedComponentDefMap = new Map(componentDefMap)
    extendedComponentDefMap.set('multiSelectField', { list: 'schemeList' })

    const state = { multiSelectField: ['scheme-1', 'scheme-2'] }
    const result = transformAnswerKeysToText(state, extendedComponentDefMap, listDefMap)

    expect(result.multiSelectField).toEqual(['Scheme One', 'Scheme Two'])
  })

  it('should fallback to using raw value if no list entry is found', () => {
    const state = { scheme: 'unknown-scheme' }
    const result = transformAnswerKeysToText(state, componentDefMap, listDefMap)
    expect(result.scheme).toBe('unknown-scheme')
  })

  it('should handle empty state gracefully', () => {
    const result = transformAnswerKeysToText({}, componentDefMap, listDefMap)
    expect(result).toEqual({})
  })
})

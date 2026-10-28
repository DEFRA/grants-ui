import { findPageByPath, resolveAdditionalAnswerSections } from './additional-answers.js'

describe('additional answers', () => {
  const additionalSections = [
    {
      page: '/score-results',
      items: [{ title: 'Score', stateValue: 'additionalAnswers.totalScore' }]
    }
  ]

  it.each([0, false, '', 75, null, undefined])(
    'resolves saved value %s without changing state or configuration',
    (value) => {
      const state = { additionalAnswers: { totalScore: value } }
      const originalState = structuredClone(state)
      const originalSections = structuredClone(additionalSections)

      const sections = resolveAdditionalAnswerSections(additionalSections, state)

      expect(sections[0].items[0]).toEqual({
        title: 'Score',
        stateValue: 'additionalAnswers.totalScore',
        value: value ?? 'Not provided'
      })
      expect(state).toEqual(originalState)
      expect(additionalSections).toEqual(originalSections)
    }
  )

  it('omits excluded pages even with a heading, while retaining sections without an owning page', () => {
    const sections = resolveAdditionalAnswerSections(
      [...additionalSections, { ...additionalSections[0], title: 'Results' }, { title: 'Other results', items: [] }],
      {},
      { relevantPages: [] }
    )

    expect(sections).toEqual([{ title: 'Other results', items: [] }])
  })

  it('matches relevant pages with or without a leading slash', () => {
    const sections = resolveAdditionalAnswerSections(
      additionalSections,
      {},
      { relevantPages: [{ path: 'score-results' }] }
    )

    expect(sections).toHaveLength(1)
    expect(sections[0].items[0].value).toBe('Not provided')
  })

  it('omits values already displayed elsewhere without losing other rows in the section', () => {
    const sections = resolveAdditionalAnswerSections(
      [
        { title: 'Payment', items: [{ title: 'Payment', stateValue: 'totalPayment' }] },
        {
          title: 'Mixed results',
          items: [
            { title: 'Payment', stateValue: 'totalPayment' },
            { title: 'Score', stateValue: 'additionalAnswers.totalScore' }
          ]
        }
      ],
      { totalPayment: '£100', additionalAnswers: { totalScore: 25 } },
      { excludedStateValues: new Set(['totalPayment']) }
    )

    expect(sections).toEqual([
      {
        title: 'Mixed results',
        items: [{ title: 'Score', stateValue: 'additionalAnswers.totalScore', value: 25 }]
      }
    ])
  })

  it.each([undefined, null, 'invalid'])('handles absent or invalid configuration: %s', (configuration) => {
    expect(resolveAdditionalAnswerSections(configuration, {})).toEqual([])
  })

  it('finds the owning page regardless of a leading slash and ignores unknown pages', () => {
    const pages = [{ path: '/score-results', section: 'project' }]

    expect(findPageByPath(pages, 'score-results')).toBe(pages[0])
    expect(findPageByPath(pages, '/missing')).toBeUndefined()
  })
})

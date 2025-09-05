import { addingValueModel } from './adding-value.js'

describe('addingValueModel', () => {
  test('should have correct structure with 5 main sections', () => {
    expect(addingValueModel).toHaveLength(5)
    expect(addingValueModel[0].title).toBe('1. Check before you start')
    expect(addingValueModel[1].title).toBe('2. Facilities')
    expect(addingValueModel[2].title).toBe('3. Costs')
    expect(addingValueModel[3].title).toBe('4. Impact')
    expect(addingValueModel[4].title).toBe('5. Finalisation')
  })

  test('should have correct subsection structure', () => {
    expect(addingValueModel[0].subsections).toHaveLength(2)
    expect(addingValueModel[1].subsections).toHaveLength(1)
    expect(addingValueModel[2].subsections).toHaveLength(1)
    expect(addingValueModel[3].subsections).toHaveLength(6)
    expect(addingValueModel[4].subsections).toHaveLength(7)
  })

  test('should have correct href values for key subsections', () => {
    expect(addingValueModel[0].subsections[0].href).toBe('business-status')
    expect(addingValueModel[1].subsections[0].href).toBe('facilities')
    expect(addingValueModel[2].subsections[0].href).toBe('costs')
    expect(addingValueModel[4].subsections[5].href).toBe('check-details')
    expect(addingValueModel[4].subsections[6].href).toBe('declaration')
  })

  test('should have cannotStartYet status for final sections', () => {
    const finalSection = addingValueModel[4].subsections
    expect(finalSection[5].status).toBe('cannotStartYet')
    expect(finalSection[6].status).toBe('cannotStartYet')
  })
})

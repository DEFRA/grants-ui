import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { DISPLAY_ONLY_TYPES } from '~/src/server/common/helpers/print-application-service/constants.js'
import { COMPOSITE_FIELD_PARTS } from '~/src/server/common/helpers/print-application-service/print-application-service.js'
import { loadSubmissionSchemaValidators, validateSubmissionAnswers } from './submission.js'

describe('Validate submission answers', () => {
  const GRANT_CODE = 'example-grant-with-auth'

  // Values mirror src/server/dev-tools/journey-runner/journeys/example-grant-with-auth.json
  const validPayload = {
    yesNoField: true,
    autocompleteField: 'WAL',
    radiosField: 'radiosFieldOption-A2',
    checkboxesField: ['checkboxesFieldOption-A2'],
    numberFieldValidation: 50000,
    numberFieldRouting: 50000,
    datePartsField__day: 1,
    datePartsField__month: 12,
    datePartsField__year: 2025,
    monthYearField__month: 12,
    monthYearField__year: 2026,
    selectField: 'selectFieldOption-A4',
    multilineTextField: 'This is a test',
    emailAddressField: 'test@example.com',
    telephoneNumberField: '01234 567890',
    ukAddressField__addressLine1: '1 Example Street',
    ukAddressField__addressLine2: null,
    ukAddressField__town: 'Exampleton',
    ukAddressField__county: null,
    ukAddressField__postcode: 'EX1 1EX',
    eastingNorthingField__easting: 530000,
    eastingNorthingField__northing: 180000,
    osGridRefField: 'ST 678 678',
    nationalGridFieldNumberField: 'NG 1234 5678',
    latLongField__latitude: 51.51945,
    latLongField__longitude: -0.127758,
    geospatialField: [
      {
        id: 'a',
        type: 'Feature',
        properties: {
          description: 'Example location',
          coordinateGridReference: 'ST 00001',
          centroidGridReference: 'ST 00001'
        },
        geometry: { type: 'Point', coordinates: [-2.5723699, 53.2380485] }
      }
    ],
    hiddenField: 'hidden value',
    projectName: 'Test project',
    projectDescription: 'Test description',
    projectBudget: 50000,
    repeatItems: [{ repeatItemName: 'Repeat item example', repeatItemAmount: 12000 }],
    landParcels: ['SD12345678']
  }

  beforeAll(() => {
    loadSubmissionSchemaValidators()
  })

  it('throws an error when no validator exists for a grant code', () => {
    expect(() => {
      validateSubmissionAnswers({}, 'UNKNOWN_CODE')
    }).toThrow('No validator found for grantCode: UNKNOWN_CODE')
  })

  it('should validate a correct payload without errors', () => {
    const result = validateSubmissionAnswers({ ...validPayload }, GRANT_CODE)
    expect(result.errors).toBeUndefined()
    expect(result.valid).toBe(true)
  })

  it('should return an error if a boolean field has wrong type', () => {
    const result = validateSubmissionAnswers({ ...validPayload, yesNoField: 'yes' }, GRANT_CODE)
    expect(result.errors).toBeDefined()
    expect(result.errors[0].instancePath).toContain('/yesNoField')
    expect(result.errors[0].message).toContain('must be boolean')
  })

  it('should return an error if a number field has wrong type', () => {
    const result = validateSubmissionAnswers(
      { ...validPayload, eastingNorthingField__easting: 'not a number' },
      GRANT_CODE
    )
    expect(result.valid).toBe(false)
    expect(result.errors[0].instancePath).toContain('eastingNorthingField__easting')
    expect(result.errors[0].message).toContain('must be number')
  })

  it('should return an error if an email field is invalid', () => {
    const result = validateSubmissionAnswers({ ...validPayload, emailAddressField: 'not-an-email' }, GRANT_CODE)
    expect(result.errors).toBeDefined()
    expect(result.errors[0].message).toContain('must match format "email"')
  })

  it('should allow missing optional fields without error', () => {
    const payloadWithoutOptionalField = { ...validPayload }
    delete payloadWithoutOptionalField.projectDescription
    delete payloadWithoutOptionalField.hiddenField

    const result = validateSubmissionAnswers(payloadWithoutOptionalField, GRANT_CODE)
    expect(result.errors).toBeUndefined()
  })

  it('should accept null for optional hiddenField (form declares required: false with no default)', () => {
    const result = validateSubmissionAnswers({ ...validPayload, hiddenField: null }, GRANT_CODE)
    expect(result.errors).toBeUndefined()
    expect(result.valid).toBe(true)
  })

  it('should return an error if missing required field', () => {
    const payloadWithoutRequiredField = { ...validPayload }
    delete payloadWithoutRequiredField.projectName

    const result = validateSubmissionAnswers(payloadWithoutRequiredField, GRANT_CODE)

    expect(result.valid).toBe(false)
    expect(result.errors).toBeDefined()
    expect(result.errors[0].message).toContain("must have required property 'projectName'")
  })
})

describe('example-grant-with-auth submission schema covers the form definition', () => {
  // State keys the engine/controllers add that aren't plain question components.
  const CONTROLLER_STATE_KEYS = ['detailsConfirmedAt', 'applicant']

  it('declares a property for every answerable component in example-grant-with-auth.yaml', () => {
    const definition = YAML.parse(
      fs.readFileSync(path.resolve('src/server/common/forms/definitions/example-grant-with-auth.yaml'), 'utf8')
    )
    const schema = JSON.parse(
      fs.readFileSync(
        path.resolve('src/server/common/forms/schemas/example-grant-with-auth-submission.schema.json'),
        'utf8'
      )
    )
    const schemaProps = new Set(Object.keys(schema.properties))

    const expectedKeys = new Set(CONTROLLER_STATE_KEYS)
    for (const page of definition.pages ?? []) {
      // RepeatPageController stores its answers as a single array under repeat.options.name
      if (page.controller === 'RepeatPageController') {
        if (page.repeat?.options?.name) {
          expectedKeys.add(page.repeat.options.name)
        }
        continue
      }
      for (const component of page.components ?? []) {
        if (!component.name || DISPLAY_ONLY_TYPES.has(component.type)) {
          continue
        }
        const parts = COMPOSITE_FIELD_PARTS[component.type]
        if (parts) {
          parts.forEach((part) => expectedKeys.add(`${component.name}__${part}`))
        } else {
          expectedKeys.add(component.name)
        }
      }
    }

    const missing = [...expectedKeys].filter((key) => !schemaProps.has(key))
    expect(missing).toEqual([])
  })
})

import Joi from 'joi'

/**
 * Joi schema definitions for application answers validation
 */

const applicationAnswersSchema = Joi.object({
  referenceNumber: Joi.string(),

  natureOfBusinessRadiosField: Joi.string(),
  legalStatusRadiosField: Joi.string(),
  countryYesNoField: Joi.boolean(),
  planningPermissionRadiosField: Joi.string(),
  projectStartRadiosField: Joi.string(),
  tenancyYesNoField: Joi.boolean(),
  smallerAbattoirYesNoField: Joi.boolean(),
  otherFarmersYesNoField: Joi.boolean(),

  projectItemsCheckboxesField: Joi.array().items(Joi.string()),
  storageRadiosField: Joi.string(),
  projectCostNumberField: Joi.number(),
  remainingCostsYesNoField: Joi.boolean(),
  produceProcessedRadiosField: Joi.string(),
  howAddingValueRadiosField: Joi.string(),
  projectImpactCheckboxesField: Joi.array().items(Joi.string()),
  mechanisationYesNoField: Joi.boolean(),
  manualLabourAmountRadiosField: Joi.string(),
  applyingRadiosField: Joi.string(),

  applicantFirstName: Joi.string(),
  applicantLastName: Joi.string(),
  applicantEmailAddress: Joi.string().email(),
  applicantConfirmEmailAddress: Joi.string().email(),
  applicantMobileNumber: Joi.string(),
  applicantLandlineNumber: Joi.string(),

  applicantBusinessAddress__addressLine1: Joi.string(),
  applicantBusinessAddress__addressLine2: Joi.string().allow(null),
  applicantBusinessAddress__town: Joi.string(),
  applicantBusinessAddress__county: Joi.string().allow(null),
  applicantBusinessAddress__postcode: Joi.string(),
  applicantProjectPostcode: Joi.string()
})

const defaultValidationOptions = {
  presence: 'optional'
}

/**
 * Validates an object against the applicationAnswersSchema
 * Only validates types of properties that are present, doesn't require any fields
 * @param {object} payload - The object to validate
 * @param {object} options - Joi validation options (optional)
 * @returns {object} - Joi validation result
 */
export function validateApplicationAnswers(
  payload,
  options = defaultValidationOptions
) {
  return applicationAnswersSchema.validate(payload, options)
}

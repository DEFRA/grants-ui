export const formSubmissionService = {
  submit: async function (formData, state) {
    // Get the reference number from the state
    const referenceNumber = state?.referenceNumber

    // Create a summary of the form data (excluding sensitive fields)
    const formDataSummary =
      Object.keys(formData || {}).length > 0
        ? {
            fieldsSubmitted: Object.keys(formData).length,
            timestamp: new Date().toISOString()
          }
        : undefined

    const result = {
      referenceNumber
    }

    if (formDataSummary) {
      result.submissionDetails = formDataSummary
    }

    return Promise.resolve({
      message: 'Form submitted successfully',
      result
    })
  }
}

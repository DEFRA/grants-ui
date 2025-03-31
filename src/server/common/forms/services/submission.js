export const formSubmissionService = {
  submit: async function () {
    // TODO: Implement actual form submission
    // 1. Send form data to API
    // 2. Generate reference number
    // 3. Send confirmation email
    // 4. Return reference number

    // For now, generate a random reference number
    const referenceNumber =
      'AV' + Math.random().toString(36).substr(2, 9).toUpperCase()

    return Promise.resolve({
      message: 'Form submitted successfully',
      result: {
        referenceNumber
      }
    })
  }
}

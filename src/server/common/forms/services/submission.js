export const formSubmissionService = {
  submit: async function (formData, state) {
    // Get the reference number from the state
    const referenceNumber = state.referenceNumber

    return Promise.resolve({
      message: 'Form submitted successfully',
      result: {
        referenceNumber
      }
    })
  }
}

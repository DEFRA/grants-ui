export const outputService = {
  submit: async function (formData, referenceNumber) {
    // TODO: Implement actual email sending
    // 1. Get email template
    // 2. Format email content with form data and reference number
    // 3. Send email to user

    // For now, just log that we would send an email]
    // eslint-disable-next-line no-console
    console.log('Would send confirmation email to:', formData.agentEmailAddress)
    // eslint-disable-next-line no-console
    console.log('Reference number:', referenceNumber)

    return Promise.resolve()
  }
}

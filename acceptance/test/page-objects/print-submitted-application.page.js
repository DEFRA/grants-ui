class PrintSubmittedApplicationPage {
  async referenceNumber() {
    return (await $(`//p[contains(text(),'Application number:')]/strong`).getText()).trim()
  }

  async submittedAnswers() {
    const submittedAnswers = []

    for (let i = 1; ; i++) {
      if (!(await $(`//h2[text()='Submitted answers']/following-sibling::dl/div[${i}]`).isExisting())) {
        break
      }

      const question = (await $(`//h2[text()='Submitted answers']/following-sibling::dl/div[${i}]/dt`).getText()).trim()
      const answer = (
        await $(`//h2[text()='Submitted answers']/following-sibling::dl/div[${i}]/dd[1]`).getText()
      ).trim()
      submittedAnswers.push({ question, answer })
    }

    return submittedAnswers
  }

  async applicantDetails() {
    const details = []

    for (const section of ['Your details', 'Business details', 'Contact details']) {
      for (let i = 1; ; i++) {
        if (!(await $(`//h3[text()='${section}']/following-sibling::dl[1]/div[${i}]`).isExisting())) {
          break
        }

        const title = (await $(`//h3[text()='${section}']/following-sibling::dl[1]/div[${i}]/dt`).getText()).trim()
        const value = (await $(`//h3[text()='${section}']/following-sibling::dl[1]/div[${i}]/dd[1]`).getText()).trim()
        details.push({ title, value })
      }
    }

    return details
  }

  async hasConfigurableContent(text) {
    return $(`//*[contains(.,'${text}')]`).isExisting()
  }
}

export default new PrintSubmittedApplicationPage()

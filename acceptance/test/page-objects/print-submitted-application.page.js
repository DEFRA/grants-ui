class PrintSubmittedApplicationPage {
  async referenceNumber(page) {
    return (await page.locator(`//p[contains(text(),'Application number:')]/strong`).textContent()).trim()
  }

  async submittedAnswers(page) {
    const submittedAnswers = []

    for (let i = 1; ; i++) {
      const row = page.locator(`//h2[text()='Submitted answers']/following-sibling::dl/div[${i}]`)
      if (!(await row.isVisible().catch(() => false))) {
        break
      }

      const question = (
        await page.locator(`//h2[text()='Submitted answers']/following-sibling::dl/div[${i}]/dt`).textContent()
      ).trim()
      const answer = (
        await page.locator(`//h2[text()='Submitted answers']/following-sibling::dl/div[${i}]/dd[1]`).textContent()
      ).trim()
      submittedAnswers.push({ question, answer })
    }

    return submittedAnswers
  }

  async applicantDetails(page) {
    const details = []

    for (const section of ['Your details', 'Business details', 'Contact details']) {
      for (let i = 1; ; i++) {
        const row = page.locator(`//h3[text()='${section}']/following-sibling::dl[1]/div[${i}]`)
        if (!(await row.isVisible().catch(() => false))) {
          break
        }

        const title = (
          await page.locator(`//h3[text()='${section}']/following-sibling::dl[1]/div[${i}]/dt`).textContent()
        ).trim()
        const value = (
          await page.locator(`//h3[text()='${section}']/following-sibling::dl[1]/div[${i}]/dd[1]`).textContent()
        ).trim()
        details.push({ title, value })
      }
    }

    return details
  }

  async hasConfigurableContent(page, text) {
    return (await page.locator(`//*[contains(.,'${text}')]`).count()) > 0
  }
}

export default new PrintSubmittedApplicationPage()

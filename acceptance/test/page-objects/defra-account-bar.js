class DefraAccountBar {
  async signOut(page) {
    await page.locator(`//div[@class='defra-account-bar']//a[contains(text(),'Sign out')]`).click()
  }

  async sbi(page) {
    const elementText = await page
      .locator(`//div[@class='defra-account-bar']//div[contains(text(),'Single business identifier (SBI):')]`)
      .textContent()
    return elementText.split(':')[1].trim()
  }
}

export default new DefraAccountBar()

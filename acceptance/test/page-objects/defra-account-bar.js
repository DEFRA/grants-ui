export default class DefraAccountBar {
  constructor(page) {
    this.page = page
  }

  async signOut() {
    await this.page.locator("//div[@class='defra-account-bar']//a[contains(text(),'Sign out')]").click()
  }

  async sbi() {
    const elementText = await this.page
      .locator("//div[@class='defra-account-bar']//div[contains(text(),'Single business identifier (SBI):')]")
      .textContent()
    return elementText.split(':')[1].trim()
  }
}

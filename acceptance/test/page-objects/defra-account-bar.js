class DefraAccountBar {
  async signOut() {
    await $(`//div[@class='defra-account-bar']//a[contains(text(),'Sign out')]`).click()
  }

  async sbi() {
    const elementText = await $(
      `//div[@class='defra-account-bar']//div[contains(text(),'Single business identifier (SBI):')]`
    ).getText()
    return elementText.split(':')[1].trim()
  }
}

export default new DefraAccountBar()

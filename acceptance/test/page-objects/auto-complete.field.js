export default class AutocompleteField {
  constructor(page, label) {
    this.page = page
    this.label = label
  }

  async clear() {
    await this.#input().click()
    await this.page.keyboard.press('Backspace')
  }

  async select(value) {
    await this.#input().click()
    await this.page.keyboard.type(value)
    await this.#option(value).click()
  }

  async getSelectedOption() {
    return await this.#input().inputValue()
  }

  #input() {
    return this.page.locator(`//label[contains(text(),'${this.label}')]/following::input[@type='text']`)
  }

  #option(value) {
    return this.page.locator(`//label[contains(text(),'${this.label}')]/following::ul/li[text()='${value}']`)
  }
}

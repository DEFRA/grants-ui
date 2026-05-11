export default class AutocompleteField {
  constructor(label) {
    this.label = label
  }

  async clear(page) {
    await this.#inputSelector(page).click()
    await page.keyboard.press('Backspace')
  }

  async select(page, value) {
    await this.#inputSelector(page).click()
    await page.keyboard.type(value)
    await this.#optionSelectorFor(page, value).click()
  }

  async getSelectedOption(page) {
    return await this.#inputSelector(page).inputValue()
  }

  #inputSelector(page) {
    return page.locator(`//label[contains(text(),'${this.label}')]/following::input[@type='text']`)
  }

  #optionSelectorFor(page, value) {
    return page.locator(`//label[contains(text(),'${this.label}')]/following::ul/li[text()='${value}']`)
  }
}

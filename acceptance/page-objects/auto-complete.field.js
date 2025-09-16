export default class AutocompleteField {
  constructor(label) {
    this.label = label
  }

  async clear() {
    await this.#inputSelector().click()
    await browser.keys('Backspace')
  }

  async select(value) {
    await this.#inputSelector().click()
    await browser.keys(value.split(''))
    await this.#optionSelectorFor(value).click()
  }

  async getSelectedOption() {
    return await this.#inputSelector().getValue()
  }

  #inputSelector() {
    return $(`//label[contains(text(),'${this.label}')]/following::input[@type='text']`)
  }

  #optionSelectorFor(value) {
    return $(`//label[contains(text(),'${this.label}')]/following::ul/li[text()='${value}']`)
  }
}

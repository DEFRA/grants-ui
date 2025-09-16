export default class MonthYearField {
  constructor(id) {
    this.id = id
  }

  async set(month, year) {
    await this.#monthSelector().setValue(month)
    await this.#yearSelector().setValue(year)
  }

  #monthSelector() {
    return $(`//input[@id='${this.id}__month']`)
  }

  #yearSelector() {
    return $(`//input[@id='${this.id}__year']`)
  }
}

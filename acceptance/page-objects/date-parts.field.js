export default class DatePartsField {
  constructor(id) {
    this.id = id
  }

  async setDateUTC(date) {
    await this.#daySelector().setValue(date.getUTCDate())
    await this.#monthSelector().setValue(date.getUTCMonth() + 1)
    await this.#yearSelector().setValue(date.getUTCFullYear())
  }

  #daySelector() {
    return $(`//input[@id='${this.id}__day']`)
  }

  #monthSelector() {
    return $(`//input[@id='${this.id}__month']`)
  }

  #yearSelector() {
    return $(`//input[@id='${this.id}__year']`)
  }
}

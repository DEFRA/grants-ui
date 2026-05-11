export default class DatePartsField {
  constructor(id) {
    this.id = id
  }

  async setDateUTC(page, date) {
    await this.#daySelector(page).fill(String(date.getUTCDate()))
    await this.#monthSelector(page).fill(String(date.getUTCMonth() + 1))
    await this.#yearSelector(page).fill(String(date.getUTCFullYear()))
  }

  #daySelector(page) {
    return page.locator(`//input[@id='${this.id}__day']`)
  }

  #monthSelector(page) {
    return page.locator(`//input[@id='${this.id}__month']`)
  }

  #yearSelector(page) {
    return page.locator(`//input[@id='${this.id}__year']`)
  }
}

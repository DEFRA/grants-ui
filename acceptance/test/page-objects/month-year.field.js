export default class MonthYearField {
  constructor(id) {
    this.id = id
  }

  async set(page, month, year) {
    await this.#monthSelector(page).fill(month)
    await this.#yearSelector(page).fill(year)
  }

  #monthSelector(page) {
    return page.locator(`//input[@id='${this.id}__month']`)
  }

  #yearSelector(page) {
    return page.locator(`//input[@id='${this.id}__year']`)
  }
}

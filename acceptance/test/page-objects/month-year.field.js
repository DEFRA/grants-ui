export default class MonthYearField {
  constructor(page, id) {
    this.page = page
    this.id = id
  }

  async set(month, year) {
    await this.page.locator(`//input[@id='${this.id}__month']`).fill(String(month))
    await this.page.locator(`//input[@id='${this.id}__year']`).fill(String(year))
  }
}

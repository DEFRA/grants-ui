export default class DatePartsField {
  constructor(page, id) {
    this.page = page
    this.id = id
  }

  async setDateUTC(date) {
    await this.page.locator(`//input[@id='${this.id}__day']`).fill(String(date.getUTCDate()))
    await this.page.locator(`//input[@id='${this.id}__month']`).fill(String(date.getUTCMonth() + 1))
    await this.page.locator(`//input[@id='${this.id}__year']`).fill(String(date.getUTCFullYear()))
  }
}

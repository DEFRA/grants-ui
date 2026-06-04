import { Before } from '@cucumber/cucumber'

class ExpectationIdStore {
  constructor() {
    this._ids = []
  }

  reset() {
    this._ids = []
  }

  get all() {
    return [...this._ids]
  }

  push(expectationId) {
    this._ids.push(expectationId)
  }
}

const expectationIds = new ExpectationIdStore()

Before(function () {
  expectationIds.reset()
})

export default expectationIds

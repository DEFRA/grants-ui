import { Before } from '@cucumber/cucumber'

class ReferenceNumberStore {
  constructor() {
    this._refs = []
  }

  reset() {
    this._refs = []
  }

  get current() {
    return this._refs[this._refs.length - 1]
  }

  get previous() {
    return this._refs[this._refs.length - 2]
  }

  get first() {
    return this._refs[0]
  }

  get second() {
    return this._refs[1]
  }

  get third() {
    return this._refs[2]
  }

  push(referenceNumber) {
    this._refs.push(referenceNumber)
  }
}

const referenceNumbers = new ReferenceNumberStore()

Before(function () {
  referenceNumbers.reset()
})

export default referenceNumbers

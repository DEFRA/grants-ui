import { world } from '@wdio/cucumber-framework'

class ReferenceNumberStore {
  get current() {
    const refs = world.referenceNumbers || []
    return refs[refs.length - 1]
  }

  get previous() {
    const refs = world.referenceNumbers || []
    return refs[refs.length - 2]
  }

  get first() {
    return world.referenceNumbers?.[0]
  }

  get second() {
    return world.referenceNumbers?.[1]
  }

  get third() {
    return world.referenceNumbers?.[2]
  }

  push(referenceNumber) {
    world.referenceNumbers = world.referenceNumbers || []
    world.referenceNumbers.push(referenceNumber)
  }
}

export default new ReferenceNumberStore()

import { world } from '@wdio/cucumber-framework'

class ExpectationIdStore {
  get all() {
    return world.expectationIds || []
  }

  push(expectationId) {
    world.expectationIds = world.expectationIds || []
    world.expectationIds.push(expectationId)
  }
}

export default new ExpectationIdStore()

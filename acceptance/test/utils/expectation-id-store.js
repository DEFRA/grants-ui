export function getExpectationIdStore(world) {
  const ids = world.expectationIds

  return {
    get all() {
      return [...ids]
    },
    push(expectationId) {
      ids.push(expectationId)
    }
  }
}

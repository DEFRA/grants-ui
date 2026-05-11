export function getReferenceNumberStore(world) {
  const refs = world.referenceNumbers

  return {
    get current() {
      return refs[refs.length - 1]
    },
    get previous() {
      return refs[refs.length - 2]
    },
    get first() {
      return refs[0]
    },
    get second() {
      return refs[1]
    },
    get third() {
      return refs[2]
    },
    push(referenceNumber) {
      refs.push(referenceNumber)
    }
  }
}

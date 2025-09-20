export async function pollForSuccess(predicate, pollingLimit = 10, pollingIntervalSeconds = 1) {
  for (let i = 0; i < pollingLimit; i++) {
    if (await predicate()) {
      return true
    }
    await new Promise((resolve) => setTimeout(resolve, pollingIntervalSeconds * 1000))
  }
  return false
}

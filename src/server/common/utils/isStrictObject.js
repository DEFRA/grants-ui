export const isStrictObject = (value, checkIfEmpty = false) => {
  const isObject = Object.prototype.toString.call(value) === '[object Object]'

  if (!isObject) {
    return false
  }

  return !(checkIfEmpty && !Object.keys(value).length)
}

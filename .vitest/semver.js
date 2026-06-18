export const SEMVER_PATTERN =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:(?:0|[1-9]\d*|\d*[A-Za-z-][\dA-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][\dA-Za-z-]*))*))?(?:\+(?:[\dA-Za-z-]+(?:\.[\dA-Za-z-]+)*))?$/

export class Semver {
  static [Symbol.hasInstance](value) {
    return typeof value === 'string' && SEMVER_PATTERN.test(value)
  }
}

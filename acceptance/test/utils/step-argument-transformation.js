import referenceNumbers from './reference-number-store'

export function transformStepArgument(value) {
  if (value === '{DATE IN A WEEK}') {
    const date = new Date()
    date.setDate(date.getUTCDate() + 7)
    return `${date.getUTCDate()} ${date.toLocaleString('default', { month: 'long' })} ${date.getUTCFullYear()}`
  }

  if (value === '{REFERENCE NUMBER}' || value === '{CURRENT REFERENCE NUMBER}') {
    if (!referenceNumbers.current) {
      throw new Error('No reference number stored by earlier step')
    }
    return referenceNumbers.current
  }

  if (value === '{ORIGINAL REFERENCE NUMBER}' || value === '{FIRST REFERENCE NUMBER}') {
    if (!referenceNumbers.first) {
      throw new Error('No reference numbers stored by earlier step')
    }
    return referenceNumbers.first
  }

  if (value === '{SECOND REFERENCE NUMBER}') {
    if (!referenceNumbers.second) {
      throw new Error('No reference numbers stored by earlier step')
    }
    return referenceNumbers.second
  }

  if (value === '{THIRD REFERENCE NUMBER}') {
    if (!referenceNumbers.third) {
      throw new Error('No reference numbers stored by earlier step')
    }
    return referenceNumbers.third
  }

  return value
}

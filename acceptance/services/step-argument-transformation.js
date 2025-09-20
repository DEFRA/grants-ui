export function transformStepArgument(value) {
  if (value === '{DATE IN A WEEK}') {
    const date = new Date()
    date.setDate(date.getUTCDate() + 7)
    return `${date.getUTCDate()} ${date.toLocaleString('default', { month: 'long' })} ${date.getUTCFullYear()}`
  }

  return value
}

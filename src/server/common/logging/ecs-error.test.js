import { toEcsError } from './ecs-error.js'

describe('toEcsError', () => {
  it('maps a normal Error to ECS format', () => {
    const err = new Error('fail')
    const ecs = toEcsError(err)

    expect(ecs.type).toBe('Error')
    expect(ecs.message).toBe('fail')
    expect(typeof ecs.stack_trace).toBe('string')
    expect(typeof ecs.id).toBe('string')
  })

  it('includes code when present', () => {
    const err = new Error('fail')
    // @ts-ignore
    err.code = 500

    const ecs = toEcsError(err)
    expect(ecs.code).toBe(500)
  })
})

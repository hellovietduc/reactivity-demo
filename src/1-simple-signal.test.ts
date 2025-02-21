import { describe, test, expect } from 'vitest'

/**
 * Just a container that holds a value.
 */
const signal = <T>(value: T) => {
  return {
    get() {
      return value
    },
    set(newValue: T) {
      value = newValue
    },
  }
}

// -------
// TESTS
// -------
describe('simple signal', () => {
  test('returns the initial value', () => {
    const s = signal(1)
    expect(s.get()).toBe(1)
  })

  test('returns the new value after setting', () => {
    const s = signal(1)
    s.set(6)
    expect(s.get()).toBe(6)
  })
})

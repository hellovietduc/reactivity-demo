import { describe, test, expect, vi } from 'vitest'

/**
 * A simple, singleton function stack; with methods to
 * push, pop, and peek.
 */
class EffectScope {
  private static instance: EffectScope
  private stack: (() => void)[] = []

  static getInstance(): EffectScope {
    if (!EffectScope.instance) {
      EffectScope.instance = new EffectScope()
    }
    return EffectScope.instance
  }

  push(effect: () => void) {
    this.stack.push(effect)
  }

  pop() {
    return this.stack.pop()
  }

  peek() {
    return this.stack[this.stack.length - 1]
  }
}

/**
 * Just a container that holds a value.
 * Now automatically tracks the effects that depend on it.
 */
const signal = <T>(value: T) => {
  const subscribers = new Set<() => void>()
  return {
    get() {
      // Here's where the automatic dependency tracking happens.
      // 1. Retrieve the current effect from the stack.
      //    This is why there's a global `EffectScope` to keep track of
      //    all the effects -- we need a way to retrieve the function
      //    that uses this signal in its body.
      //    In real frameworks, this `EffectScope` is not global and tends
      //    to tie with component lifecycle to be able to clean up effects
      //    when needed.
      const currentEffect = EffectScope.getInstance().peek()
      if (currentEffect) {
        // 2. Add the effect to this signal's subscriber list so that it can
        //    be called when the signal changes.
        //    `subscribers` is a list (Set) because a signal can have a lot
        //    of dependencies.
        subscribers.add(currentEffect)
      }
      return value
    },
    set(newValue: T) {
      value = newValue
      // Whenever the value changes, notify all the subscribers.
      subscribers.forEach((callback) => callback())
    },
  }
}

/**
 * Runs the callback and reruns it whenever the signals it depend on change.
 */
const effect = (callback: () => void) => {
  const scope = EffectScope.getInstance()
  // Push the effect to `EffectScope` so signals can retrieve it.
  scope.push(callback)
  // Run the effect right away. Any signal that is used inside the effect
  // will start tracking it (the effect is added to its subscriber list).
  callback()
  // Pop the effect from `EffectScope` now as automatic dependency tracking
  // is done and avoid a case where if a signal is used twice in the same
  // effect, when it changes, the effect is called twice.
  scope.pop()
}

// -------
// TESTS
// -------
describe('signal with effect', () => {
  test('returns the initial value', () => {
    const s = signal(1)
    expect(s.get()).toBe(1)
  })

  test('returns the new value after setting', () => {
    const s = signal(1)
    s.set(6)
    expect(s.get()).toBe(6)
  })

  test('calls the effect after setting', () => {
    const s = signal(1)
    const mock = vi.fn()

    // The effect is called right away.
    effect(() => {
      mock(s.get())
    })
    expect(mock).toBeCalledTimes(1)

    // The effect is called again when the signal changes.
    s.set(43)
    expect(mock).toBeCalledWith(43)
    expect(mock).toBeCalledTimes(2)

    s.set(91)
    s.set(199)
    expect(mock).toBeCalledWith(199)
    expect(mock).toBeCalledTimes(4)
  })

  test('calls the effect only once when the signal is used multiple times', () => {
    const s = signal(1)
    const mock = vi.fn()

    effect(() => {
      mock(s.get() + s.get())
    })
    expect(mock).toBeCalledTimes(1)

    s.set(43)
    expect(mock).toBeCalledWith(43 + 43)
    expect(mock).toBeCalledTimes(2)

    s.set(199)
    expect(mock).toBeCalledWith(199 + 199)
    expect(mock).toBeCalledTimes(3)
  })

  test('handles multiple independent effects', () => {
    const s = signal('hello')
    const mock1 = vi.fn()
    const mock2 = vi.fn()

    effect(() => mock1(s.get()))
    effect(() => mock2(s.get() + ' world'))

    expect(mock1).toBeCalledWith('hello')
    expect(mock1).toBeCalledTimes(1)

    expect(mock2).toBeCalledWith('hello world')
    expect(mock2).toBeCalledTimes(1)

    s.set('goodbye')

    expect(mock1).toBeCalledWith('goodbye')
    expect(mock1).toBeCalledTimes(2)

    expect(mock2).toBeCalledWith('goodbye world')
    expect(mock2).toBeCalledTimes(2)
  })

  test('effect not triggered when using signal outside effect', () => {
    const s = signal('yes sir')
    const mock = vi.fn()

    effect(() => mock(s.get()))
    expect(mock).toBeCalledWith('yes sir')
    expect(mock).toBeCalledTimes(1)

    const value = s.get() // This should not subscribe to the signal
    expect(value).toBe('yes sir')
    expect(mock).toBeCalledTimes(1)

    s.set('no sir')
    expect(mock).toBeCalledWith('no sir')
    expect(mock).toBeCalledTimes(2) // Only the effect should be called
  })
})

import { describe, test, expect, vi } from 'vitest'

/**
 * A simple, singleton stack to keep track of the active effect.
 */
class EffectStack {
  private static instance: EffectStack
  private stack: (() => void)[] = []

  static getInstance(): EffectStack {
    if (!EffectStack.instance) {
      EffectStack.instance = new EffectStack()
    }
    return EffectStack.instance
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
  const dependents = new Set<() => void>()
  return {
    get() {
      // Automatic dependency tracking:
      // 1. Check if there's an active effect running.
      const currentEffect = EffectStack.getInstance().peek()
      if (currentEffect) {
        // 2. If yes, add this effect to our dependents.
        //    Now, this signal knows the effect cares about its value.
        dependents.add(currentEffect)
      }
      return value
    },
    set(newValue: T) {
      // Avoid triggering effects if the value hasn't actually changed.
      if (Object.is(value, newValue)) {
        return
      }
      value = newValue
      // Notify all dependent effects that the value has changed.
      // Use [...dependents] to iterate over a snapshot, avoiding issues
      // if an effect modifies the dependent set during execution.
      ;[...dependents].forEach((effect) => effect())
    },
  }
}

/**
 * Runs the callback immediately and reruns it
 * whenever any signal read inside the callback changes.
 */
const effect = (callback: () => void) => {
  const effectWrapper = () => {
    const stack = EffectStack.getInstance()
    stack.push(effectWrapper) // Push this wrapper onto the stack
    try {
      callback() // Run the actual user code
    } finally {
      stack.pop() // Always pop, even if callback throws error
    }
  }
  // Run the effect immediately to establish initial dependencies
  effectWrapper()
}

// -------
// TESTS
// -------
describe('signal with effect', () => {
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

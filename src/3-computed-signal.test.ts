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

/**
 * A signal whose value is derived from other signals.
 * It's lazy, cached, and reactive.
 */
const computed = <T>(calculation: () => T) => {
  // It needs its own value and dependency tracking, like a signal.
  let cached: T
  const dependents = new Set<() => void>()
  let isStale = true // Start as stale, needs calculation on first get

  const markStale = () => {
    isStale = true
    // Notify our dependents that we might have changed.
    ;[...dependents].forEach((effect) => effect())
  }

  const trackAndCalculate = () => {
    const stack = EffectStack.getInstance()
    stack.push(markStale) // Signals inside calculation will track `markStale`
    try {
      cached = calculation() // Perform the actual calculation
    } finally {
      stack.pop()
    }
    isStale = false // Value is now fresh
  }

  return {
    get() {
      // Like `signal.get()`, track who depends on this computed.
      const currentEffect = EffectStack.getInstance().peek()
      if (currentEffect) {
        dependents.add(currentEffect)
      }

      // If stale, recalculate before returning.
      if (isStale) {
        trackAndCalculate()
      }
      return cached
    },
    // Note: No `set` method for computed signals!
  }
}

// -------
// TESTS
// -------
describe('computed signal', () => {
  test('computes the value correctly', () => {
    const a = signal([1, 2, 3])
    const b = signal([4, 5, 6])
    const lengthSum = computed(() => a.get().length + b.get().length)

    expect(lengthSum.get()).toBe(6)

    a.set([8, 9])
    expect(lengthSum.get()).toBe(5)

    b.set([])
    expect(lengthSum.get()).toBe(2)
  })

  test('lazily computes the value', () => {
    const a = signal([1, 2])
    const b = signal([3, 4])
    const mock = vi.fn()

    // The computation is not run when the computed signal is created.
    const lengthSum = computed(() => {
      mock()
      return a.get().length + b.get().length
    })
    expect(mock).toBeCalledTimes(0)

    // The computation is run when the value is accessed.
    expect(lengthSum.get()).toBe(4)
    expect(mock).toBeCalledTimes(1)

    // The value is cached, accessing it again does not run the computation.
    expect(lengthSum.get()).toBe(4)
    expect(lengthSum.get()).toBe(4)
    expect(mock).toBeCalledTimes(1)

    // The computation is lazy, updating its dependency does not run the computation.
    a.set([1, 2, 3, 4, 5])
    expect(mock).toBeCalledTimes(1)

    // Accessing the value runs the computation again.
    expect(lengthSum.get()).toBe(7)
    expect(mock).toBeCalledTimes(2)
  })

  test('effect reacts to computed signals', () => {
    const s = signal(1)
    const double = computed(() => s.get() * 2)
    const mock = vi.fn()

    effect(() => {
      mock(double.get())
    })
    expect(mock).toBeCalledWith(2)
    expect(mock).toBeCalledTimes(1)

    s.set(3)
    expect(mock).toBeCalledWith(6)
    expect(mock).toBeCalledTimes(2)

    s.set(5)
    s.set(7)
    expect(mock).toBeCalledWith(14)
    expect(mock).toBeCalledTimes(4)
  })

  test('reacts to other computed signals, computation is still lazy', () => {
    const a = signal(1)
    const mockB = vi.fn()
    const mockC = vi.fn()
    const mockD = vi.fn()

    const b = computed(() => {
      mockB()
      return a.get() * 2
    })
    const c = computed(() => {
      mockC()
      return b.get() + 2
    })
    const d = computed(() => {
      mockD()
      return b.get() - c.get()
    })

    // Every computed is lazy.
    expect(mockB).toBeCalledTimes(0)
    expect(mockC).toBeCalledTimes(0)
    expect(mockD).toBeCalledTimes(0)

    // Accessing `d` will trigger the computation of `b` and `c`.
    expect(d.get()).toBe(-2)
    expect(mockB).toBeCalledTimes(1)
    expect(mockC).toBeCalledTimes(1)

    // Check correctness.
    expect(b.get()).toBe(2)
    expect(c.get()).toBe(4)

    // When `a` changes, nothing recomputes yet.
    a.set(3)
    expect(mockB).toBeCalledTimes(1)
    expect(mockC).toBeCalledTimes(1)
    expect(mockD).toBeCalledTimes(1)

    // Accessing `b` will trigger the computation of `b` only.
    expect(b.get()).toBe(6)
    expect(mockB).toBeCalledTimes(2)
    expect(mockC).toBeCalledTimes(1)
    expect(mockD).toBeCalledTimes(1)

    // Check correctness.
    expect(c.get()).toBe(8)
    expect(d.get()).toBe(-2)
  })
})

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
 * A signal that derives its value from other signals. The result is cached,
 * and only recomputed when accessed AND its dependencies change.
 */
const computed = <T>(callback: () => T) => {
  let cached: T
  let isStale = true

  const markStale = () => {
    isStale = true
  }

  return {
    get() {
      // If the cached value is still fresh, return it. There's no need to
      // recompute.
      if (!isStale) {
        return cached
      }

      const scope = EffectScope.getInstance()

      // To let the computed signal know that the cached value has become
      // stale, push the `markStale` function to the stack. This way, when
      // the signal's `set` method is called, it'll invalidate all computed
      // signals that depend on it. The next time the computed signal is
      // accessed, it'll recompute the value.
      scope.push(markStale)
      cached = callback()
      scope.pop()

      isStale = false
      return cached
    },
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
})

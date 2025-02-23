import { describe, test, expect, vi } from 'vitest'

/**
 * A simple, singleton function stack; with methods to
 * push, pop, and peek.
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
  const dependencies = new Set<() => void>()
  return {
    get() {
      // Here's where the automatic dependency tracking happens.
      // 1. Retrieve the current effect from the stack.
      //    This is why there's a global `EffectStack` to keep track of
      //    all the effects -- we need a way to retrieve the function
      //    that uses this signal in its body.
      const currentEffect = EffectStack.getInstance().peek()
      if (currentEffect) {
        // 2. Add the effect to this signal's dependency list so that it can
        //    be called when the signal changes.
        //    `dependencies` is a list (Set) because a signal can have a lot
        //    of them.
        dependencies.add(currentEffect)
      }
      return value
    },
    set(newValue: T) {
      value = newValue
      // Whenever the value changes, notify all the dependencies.
      dependencies.forEach((effect) => effect())
    },
  }
}

/**
 * A signal that derives its value from other signals. The result is cached,
 * and only recomputed when accessed AND its dependencies change.
 */
const computed = <T>(callback: () => T) => {
  // 1. Computed signals are more complicated because they are both value
  //    containers and effects. Specifically, they need to keep track of
  //    their dependencies and notify them when the value changes. On top
  //    of that, they need to cache their computation results.
  const dependencies = new Set<() => void>()
  let cached: T
  let isStale = true

  const markStale = () => {
    isStale = true

    // 5. Only notify dependencies when the cached value has become stale.
    dependencies.forEach((effect) => effect())
  }

  return {
    get() {
      const currentEffect = EffectStack.getInstance().peek()

      // 2. If the cached value is still fresh, return it. There's no need to
      //    recompute.
      if (!isStale) {
        // 3. Always perform dependency tracking, no matter if the value is stale
        //    or not.
        if (currentEffect) dependencies.add(currentEffect)
        return cached
      }

      const stack = EffectStack.getInstance()

      // 4. To let this computed signal know that the cached value has become
      //    stale, push the `markStale` function to the stack. This way, when
      //    a signal's `set` method is called, or another computed signal's
      //    `markStale` is called, it'll invalidate the cached value here. The
      //    next time this computed signal is accessed, it'll recompute the value.
      stack.push(markStale)
      cached = callback()
      stack.pop()

      // 3.
      if (currentEffect) dependencies.add(currentEffect)

      isStale = false
      return cached
    },
  }
}

/**
 * Runs the callback and reruns it whenever the signals it depend on change.
 */
const effect = (callback: () => void) => {
  const stack = EffectStack.getInstance()
  // Push the effect to `EffectStack` so signals can retrieve it.
  stack.push(callback)
  // Run the effect right away. Any signal that is used inside the effect
  // will start tracking it (the effect is added to its dependency list).
  callback()
  // Pop the effect from `EffectStack` now as automatic dependency tracking
  // is done and avoid a case where if a signal is used twice in the same
  // effect, when it changes, the effect is called twice.
  stack.pop()
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

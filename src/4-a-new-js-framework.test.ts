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
  // 1. Computed signals are more complicated because they are both value
  //    containers and effects. Specifically, they need to keep track of
  //    their subscribers and notify them when the value changes. On top
  //    of that, they need to cache their computation results.
  const subscribers = new Set<() => void>()
  let cached: T
  let isStale = true

  const markStale = () => {
    isStale = true

    // 5. Only notify subscribers when the cached value has become stale.
    subscribers.forEach((callback) => callback())
  }

  return {
    get() {
      const currentEffect = EffectScope.getInstance().peek()

      // 2. If the cached value is still fresh, return it. There's no need to
      //    recompute.
      if (!isStale) {
        // 3. Always perform dependency tracking, no matter if the value is stale
        //    or not.
        if (currentEffect) subscribers.add(currentEffect)
        return cached
      }

      const scope = EffectScope.getInstance()

      // 4. To let this computed signal know that the cached value has become
      //    stale, push the `markStale` function to the stack. This way, when
      //    a signal's `set` method is called, or another computed signal's
      //    `markStale` is called, it'll invalidate the cached value here. The
      //    next time this computed signal is accessed, it'll recompute the value.
      scope.push(markStale)
      cached = callback()
      scope.pop()

      // 3.
      if (currentEffect) subscribers.add(currentEffect)

      isStale = false
      return cached
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

type Component = () => () => string

/**
 * A simple function that mounts a component to an element and rerenders
 * it whenever the signals inside the component change.
 */
const createApp = (component: Component, root: HTMLElement) => {
  // 1. Call the component to set up its signals and effects. This will return
  //    a render function which can be called to get the HTML string.
  const render = component()

  // 2. Create a `renderApp` function that is aware of whether it's the first
  //    render or not.
  const renderApp = (() => {
    let firstRender = true
    return () => {
      // 3. If it's the first render, the render function has to be called synchronously
      //    in order for `renderApp` function to be registered as a dependency of the
      //    signals inside the component. If not, `renderApp` will be removed from the
      //    stack before the signals are accessed.
      if (firstRender) {
        root.innerHTML = render()
        firstRender = false
        return
      }

      // 4. The reason subsequent renders have to be delayed is to allow computed
      //    signals to be invalidated before the rerender. Imagine a signal have
      //    these methods in its subscriber list: [renderApp, markStale]. When the
      //    signal's `set` method is called, it'll call all the subscribers IN ORDER.
      //    If `renderApp` is called synchronously, the computed signal will still
      //    return the old value and the DOM will not be updated correctly.
      queueMicrotask(() => {
        root.innerHTML = render()
      })
    }
  })()

  // 5. Create a reactive effect. This allows the signals inside the component
  //    to add the `renderApp` function to their subscriber list. When the signals
  //    change, the `renderApp` function will be called to update the DOM.
  effect(renderApp)
}

// -------
// TESTS
// -------

vi.useFakeTimers({ toFake: ['setInterval', 'queueMicrotask'] })

describe('a new js framework', () => {
  test('can render', () => {
    const App: Component = () => {
      const count = signal(0)
      return () => `<div>Count is ${count.get()}</div>`
    }

    const root = document.createElement('div')
    createApp(App, root)

    expect(root.innerHTML).toBe('<div>Count is 0</div>')
  })

  test('rerenders when a signal changes', () => {
    const App: Component = () => {
      const count = signal(0)
      const double = computed(() => count.get() * 2)

      // Simulate an external event that changes the signal.
      setInterval(() => {
        const newCount = count.get() + 1
        count.set(newCount)
      }, 500)

      return () =>
        `<div>Count is ${count.get()} and double is ${double.get()}</div>`
    }

    const root = document.createElement('div')
    createApp(App, root)

    expect(root.innerHTML).toBe('<div>Count is 0 and double is 0</div>')

    vi.advanceTimersByTime(500)
    vi.runAllTicks()
    expect(root.innerHTML).toBe('<div>Count is 1 and double is 2</div>')

    vi.advanceTimersByTime(500)
    vi.runAllTicks()
    expect(root.innerHTML).toBe('<div>Count is 2 and double is 4</div>')

    vi.advanceTimersByTime(1000)
    vi.runAllTicks()
    expect(root.innerHTML).toBe('<div>Count is 4 and double is 8</div>')
  })
})

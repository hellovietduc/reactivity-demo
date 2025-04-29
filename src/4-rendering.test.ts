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

type Component = () => () => string

/**
 * A simple function that mounts a component to an element and rerenders
 * it whenever the signals inside the component change.
 */
const createApp = (component: Component, root: HTMLElement) => {
  // 1. Call the component to set up its signals and effects. This will return
  //    a render function which can be called to get the HTML string.
  //    This follows a simple model:
  //      view = render(state)
  const render = component()

  // 2. Create a `renderApp` function that writes the output from `render` to the
  //    `root` element.
  const renderApp = (() => {
    let firstRender = true
    return () => {
      // 4. If it's the first render, the render function has to be called synchronously
      //    in order for `renderApp` function to be registered as a dependency of the
      //    signals inside the component. If not, `renderApp` will be removed from the
      //    stack before the signals are accessed.
      if (firstRender) {
        root.innerHTML = render()
        firstRender = false
        return
      }

      // 5. The reason subsequent renders have to be delayed is to allow computed
      //    signals to be invalidated before the rerender. Imagine a signal have
      //    these methods in its dependency list: [renderApp, markStale]. When the
      //    signal's `set` method is called, it'll call all the dependencies IN ORDER.
      //    If `renderApp` is called synchronously, the computed signal will still
      //    return the old value and the DOM will not be updated correctly.
      queueMicrotask(() => {
        root.innerHTML = render()
      })
    }
  })()

  // 3. Create a reactive effect. This allows all the signals inside the component
  //    to add the `renderApp` function to their dependency list. When the signals
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

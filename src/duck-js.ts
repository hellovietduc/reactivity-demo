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
      if (firstRender) {
        root.innerHTML = render()
        firstRender = false
        return
      }

      // 3. The reason subsequent renders have to be delayed is to allow computed
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

  // 4. Create a reactive effect. This allows the signals inside the component
  //    to add the `renderApp` function to their subscriber list. When the signals
  //    change, the `renderApp` function will be called to update the DOM.
  effect(renderApp)
}

export { signal, computed, effect, createApp }
export type { Component }

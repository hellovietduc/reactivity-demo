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

type Component = () => () => string | string[]

/**
 * A simple function that mounts a component to an element and rerenders
 * it whenever the signals inside the component change.
 */
const createApp = (component: Component, root: HTMLElement | null) => {
  if (!root) throw new Error('Root element not found')

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
        const html = render()
        root.innerHTML = Array.isArray(html) ? html.join('') : html
        firstRender = false
        return
      }

      // 4. The reason subsequent renders have to be delayed is to allow computed
      //    signals to be invalidated before the rerender. Imagine a signal have
      //    these methods in its dependency list: [renderApp, markStale]. When the
      //    signal's `set` method is called, it'll call all the dependencies IN ORDER.
      //    If `renderApp` is called synchronously, the computed signal will still
      //    return the old value and the DOM will not be updated correctly.
      queueMicrotask(() => {
        const html = render()
        root.innerHTML = Array.isArray(html) ? html.join('') : html
      })
    }
  })()

  // 5. Create a reactive effect. This allows the signals inside the component
  //    to add the `renderApp` function to their dependency list. When the signals
  //    change, the `renderApp` function will be called to update the DOM.
  effect(renderApp)
}

export { signal, computed, effect, createApp }
export type { Component }

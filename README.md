# duckJS - Reactivity demo

My own exploration of a signal-based reactivity model. Resource for an internal tech talk at @padlet.

## Example code

```ts
const App: Component = () => {
  effect(() => {
    if (numberOfDucks.get() % 7 === 0) {
      isLuckyNumber.set(true)
      window.fireConfetti()
    } else {
      isLuckyNumber.set(false)
    }
  })

  return () => {
    return Array.from({ length: numberOfDucks.get() }, () => {
      return `<span class="shrink-0">${DUCK_SVG()}</span>`
    }).join('')
  }
}

const Msg: Component = () => {
  return () => {
    if (isLuckyNumber.get()) {
      return '<div class="text-2xl text-green-500">🎉 Yay! Lucky number! 🎉</div>'
    }
    return ''
  }
}
```

See the full code in [src/app.ts](./src/app.ts) and [src/duck-js](./src/duck-js.ts).

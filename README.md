# duckJS - Reactivity demo

My own exploration of a signal-based reactivity model. Resource for an internal tech talk at [Padlet](https://padlet.com).

## Example code

```ts
const numberOfDucks = signal(1)
const isLuckyNumber = signal(false)

const Ducks: Component = () => {
  effect(() => {
    if (numberOfDucks.get() % 7 === 0) {
      isLuckyNumber.set(true)
      window.fireConfetti()
    } else {
      isLuckyNumber.set(false)
    }
  })

  return () =>
    Array.from(
      { length: numberOfDucks.get() },
      () => `<span class="shrink-0">${DUCK_SVG()}</span>`,
    )
}

const Message: Component = () => {
  return () =>
    isLuckyNumber.get()
      ? '<div class="text-2xl text-green-500">🎉 Yay! Lucky number! 🎉</div>'
      : ''
}
```

See the full code in [src/app.ts](./src/app.ts) and [src/duck-js](./src/duck-js.ts).

## Development

This project uses [Vite](https://vite.dev/) and [Vitest](https://vitest.dev/).

- `yarn dev`: Run the demo
- `yarn test`: Run the tests for the reactivity model

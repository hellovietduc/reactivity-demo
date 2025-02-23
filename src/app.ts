import { type Component, createApp, effect, signal } from './duck-js'
import { DUCK_SVG } from './duck-svg'

const numberOfDucks = signal(1)
const isLuckyNumber = signal(false)

const increaseDucks = () => {
  numberOfDucks.set(numberOfDucks.get() + 1)
}

const decreaseDucks = () => {
  const current = numberOfDucks.get()
  if (current === 0) return
  numberOfDucks.set(numberOfDucks.get() - 1)
}

const randomizeDucks = () => {
  // between 5 and 50
  numberOfDucks.set(Math.floor(Math.random() * (50 - 5 + 1)) + 5)
}

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

createApp(Ducks, document.getElementById('ducks'))
createApp(Message, document.getElementById('msg'))

const moreButton = document.getElementById('more-ducks-btn')
moreButton?.addEventListener('click', increaseDucks)

const lessButton = document.getElementById('less-ducks-btn')
lessButton?.addEventListener('click', decreaseDucks)

const randomButton = document.getElementById('random-ducks-btn')
randomButton?.addEventListener('click', randomizeDucks)

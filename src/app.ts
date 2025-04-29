import { type Component, computed, createApp, effect, signal } from './duck-js'
import { DUCK_SVG } from './duck-svg'

// --- State ---
const numberOfDucks = signal(1)
const isLuckyNumber = computed(() => numberOfDucks.get() % 7 === 0)

// --- Actions ---
const increaseDucks = () => numberOfDucks.set(numberOfDucks.get() + 1)
const decreaseDucks = () =>
  numberOfDucks.get() > 0 && numberOfDucks.set(numberOfDucks.get() - 1)
const randomizeDucks = () =>
  numberOfDucks.set(Math.floor(Math.random() * (50 - 5 + 1)) + 5) // between 5 and 50

// --- Components
const Ducks: Component = () => {
  effect(() => {
    if (isLuckyNumber.get()) {
      window.fireConfetti()
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

// --- Mounting the app
createApp(Ducks, document.getElementById('ducks'))
createApp(Message, document.getElementById('msg'))

const moreButton = document.getElementById('more-ducks-btn')
moreButton?.addEventListener('click', increaseDucks)

const lessButton = document.getElementById('less-ducks-btn')
lessButton?.addEventListener('click', decreaseDucks)

const randomButton = document.getElementById('random-ducks-btn')
randomButton?.addEventListener('click', randomizeDucks)

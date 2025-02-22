import { type Component, createApp, effect, signal } from './duck-js'

declare global {
  interface Window {
    fireConfetti: () => void
  }
}

const DUCK_SVG = () => {
  const randomColor = () => {
    return '#' + Math.floor(Math.random() * 16777215).toString(16)
  }

  return `<svg width="100" height="100" viewBox="0 0 100 100">
  <g fill="${randomColor()}">
    <!-- Body -->
    <rect x="30" y="40" width="40" height="30"/>
    <!-- Head -->
    <rect x="60" y="30" width="20" height="20"/>
    <!-- Beak -->
    <rect x="75" y="35" width="15" height="10" fill="${randomColor()}"/>
    <!-- Eye -->
    <rect x="65" y="35" width="5" height="5" fill="#000"/>
    <!-- Wing -->
    <rect x="35" y="45" width="15" height="15"/>
  </g>
</svg>`
}

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

const root = document.getElementById('app')
if (!root) throw new Error('Root element not found')
createApp(App, root)

const msgRoot = document.getElementById('msg')
if (!msgRoot) throw new Error('Root element not found')
createApp(Msg, msgRoot)

const moreButton = document.getElementById('more-ducks-btn')
if (!moreButton) throw new Error('Button element not found')
moreButton.addEventListener('click', increaseDucks)

const lessButton = document.getElementById('less-ducks-btn')
if (!lessButton) throw new Error('Button element not found')
lessButton.addEventListener('click', decreaseDucks)

const randomButton = document.getElementById('random-ducks-btn')
if (!randomButton) throw new Error('Button element not found')
randomButton.addEventListener('click', randomizeDucks)

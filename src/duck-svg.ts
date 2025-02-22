export const DUCK_SVG = () => {
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

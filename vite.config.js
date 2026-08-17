import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Cible CSS explicite : sans elle, le minifieur réécrit les media queries en
    // syntaxe « range » (`@media (width<=700px)`), comprise seulement à partir de
    // Safari 16.4. Les IADE consultent l'app depuis leur téléphone, parfois un
    // iPhone plus ancien : on conserve la forme `max-width` classique.
    cssTarget: ['safari14', 'chrome90', 'firefox90'],
  },
})

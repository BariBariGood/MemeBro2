import { createRoot } from 'react-dom/client'
import { ScrollMorphHero } from './ScrollMorphHero.jsx'
import './hero.css'

function onLaunchWithMeme(_dataUrl) {
  window.dispatchEvent(new CustomEvent('memebro:start'))
}

function onBrowseTemplates() {
  window.dispatchEvent(new CustomEvent('memebro:start'))
}

const rootEl = document.getElementById('scroll-morph-hero-root')
if (rootEl) {
  createRoot(rootEl).render(
    <ScrollMorphHero
      onLaunchWithMeme={onLaunchWithMeme}
      onBrowseTemplates={onBrowseTemplates}
    />,
  )
}

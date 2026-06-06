/**
 * @module main
 * Entry point that bridges the React hero section with the vanilla-JS
 * MemeBro app. Mounts {@link ScrollMorphHero} into `#scroll-morph-hero-root`
 * and dispatches a `memebro:start` CustomEvent when the user chooses to
 * enter the studio (via upload or template browse), which the outer app
 * listens for to transition away from the landing screen.
 */

import { createRoot } from 'react-dom/client'
import { ScrollMorphHero } from './ScrollMorphHero.jsx'
import './hero.css'

/**
 * Hero callback — fires `memebro:start` so the vanilla app hides the
 * hero and opens the studio with the user's uploaded image.
 *
 * @param {string} _dataUrl - Base-64 data-URL of the dropped image (unused
 *   by the event; the studio re-reads the file independently)
 */
function onLaunchWithMeme(_dataUrl) {
  window.dispatchEvent(new CustomEvent('memebro:start'))
}

/**
 * Hero callback — fires `memebro:start` so the vanilla app shows the
 * template picker.
 */
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

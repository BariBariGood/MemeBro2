import { useEffect, useRef, useState } from 'react'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { lerp } from './lerp.js'
import { MEMES } from './memes.js'
import { Button } from './Button.jsx'

// ── Icons ──────────────────────────────────────

function IconArrowRight() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  )
}

function IconLayers() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  )
}

function IconUpload() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  )
}

// ── Constants ─────────────────────────────────

const IMG_WIDTH  = 80
const IMG_HEIGHT = 80

const TOTAL_IMAGES_DESKTOP = 20
const TOTAL_IMAGES_MOBILE  = 12

const MAX_SCROLL_DESKTOP = 3000
const MAX_SCROLL_MOBILE  = 1500

const MOBILE_MQ = '(max-width: 767px)'

/** Returns true when prefers-reduced-motion is set. */
function prefersReducedMotion() {
  return typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// ── Scatter positions (computed once at module load) ──

const SCATTER_POSITIONS = Array.from({ length: TOTAL_IMAGES_DESKTOP }, () => ({
  x:        (Math.random() - 0.5) * 1500,
  y:        (Math.random() - 0.5) * 1000,
  rotation: (Math.random() - 0.5) * 180,
  scale:    0.6,
  opacity:  0,
}))

// ── computeTarget ─────────────────────────────

function computeTarget({ index, introPhase, containerSize, morphValue, rotateValue, parallaxValue, totalImages }) {
  if (introPhase === 'scatter') return SCATTER_POSITIONS[index]

  if (introPhase === 'line') {
    const lineSpacing    = 90
    const lineTotalWidth = totalImages * lineSpacing
    const lineX          = index * lineSpacing - lineTotalWidth / 2
    return { x: lineX, y: 0, rotation: 0, scale: 1, opacity: 1 }
  }

  const isMobile    = containerSize.width < 768
  const minDimension = Math.min(containerSize.width, containerSize.height)

  const circleRadius = Math.min(minDimension * 0.35, 350)
  const circleAngle  = (index / totalImages) * 360
  const circleRad    = (circleAngle * Math.PI) / 180
  const circlePos    = {
    x:        Math.cos(circleRad) * circleRadius,
    y:        Math.sin(circleRad) * circleRadius,
    rotation: circleAngle + 90,
  }

  const baseRadius   = Math.min(containerSize.width, containerSize.height * 1.5)
  const arcRadius    = baseRadius * (isMobile ? 1.4 : 1.1)
  const arcApexY     = containerSize.height * (isMobile ? 0.35 : 0.25)
  const arcCenterY   = arcApexY + arcRadius
  const spreadAngle  = isMobile ? 100 : 130
  const startAngle   = -90 - spreadAngle / 2
  const step         = spreadAngle / Math.max(totalImages - 1, 1)

  const scrollProgress  = Math.min(Math.max(rotateValue / 360, 0), 1)
  const maxRotation     = spreadAngle * 0.8
  const boundedRotation = -scrollProgress * maxRotation

  const currentArcAngle = startAngle + index * step + boundedRotation
  const arcRad          = (currentArcAngle * Math.PI) / 180
  const arcPos = {
    x:        Math.cos(arcRad) * arcRadius + parallaxValue,
    y:        Math.sin(arcRad) * arcRadius + arcCenterY,
    rotation: currentArcAngle + 90,
    scale:    isMobile ? 1.6 : 1.8,
  }

  return {
    x:        lerp(circlePos.x, arcPos.x, morphValue),
    y:        lerp(circlePos.y, arcPos.y, morphValue),
    rotation: lerp(circlePos.rotation, arcPos.rotation, morphValue),
    scale:    lerp(1, arcPos.scale, morphValue),
    opacity:  1,
  }
}

// ── FlipCard ──────────────────────────────────

function FlipCard({ src, name, target, simple }) {
  if (simple) {
    return (
      <motion.div
        animate={{ x: target.x, y: target.y, rotate: target.rotation, scale: target.scale, opacity: target.opacity }}
        transition={{ type: 'spring', stiffness: 90, damping: 20 }}
        style={{ position: 'absolute', width: IMG_WIDTH, height: IMG_HEIGHT }}
        className="overflow-hidden rounded-xl ring-1 ring-white/10 bg-ink-2"
      >
        <img src={src} alt={name} className="h-full w-full object-cover" loading="lazy" decoding="async" draggable={false} />
        <div className="absolute inset-0 bg-black/25 pointer-events-none" />
      </motion.div>
    )
  }

  return (
    <motion.div
      animate={{ x: target.x, y: target.y, rotate: target.rotation, scale: target.scale, opacity: target.opacity }}
      transition={{ type: 'spring', stiffness: 40, damping: 15 }}
      style={{ position: 'absolute', width: IMG_WIDTH, height: IMG_HEIGHT, transformStyle: 'preserve-3d', perspective: '1000px' }}
      className="cursor-pointer group"
    >
      <motion.div
        className="relative h-full w-full"
        style={{ transformStyle: 'preserve-3d' }}
        transition={{ duration: 0.6, type: 'spring', stiffness: 260, damping: 20 }}
        whileHover={{ rotateY: 180 }}
      >
        <div
          className="absolute inset-0 h-full w-full overflow-hidden rounded-xl ring-1 ring-white/10 bg-ink-2 shadow-[0_8px_30px_-8px_rgba(255,78,205,0.45)]"
          style={{ backfaceVisibility: 'hidden' }}
        >
          <img src={src} alt={name} className="h-full w-full object-cover" loading="lazy" decoding="async" draggable={false} />
          <div className="absolute inset-0 bg-black/25 transition-opacity duration-300 group-hover:opacity-0" />
        </div>
        <div
          className="absolute inset-0 h-full w-full overflow-hidden rounded-xl ring-1 ring-white/15 bg-gradient-to-br from-fuchsia/30 via-ink-2 to-acid/20 backdrop-blur flex flex-col items-center justify-center p-2"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          <p className="text-[7px] font-display tracking-[0.25em] uppercase text-acid">memebro</p>
          <p className="mt-1 text-[9px] font-medium text-white text-center leading-tight">{name}</p>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── useIsMobile ───────────────────────────────

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(MOBILE_MQ).matches,
  )
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq      = window.matchMedia(MOBILE_MQ)
    const handler = (e) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return isMobile
}

// ── ScrollMorphHero ───────────────────────────

export function ScrollMorphHero({ onLaunchWithMeme, onBrowseTemplates }) {
  const reducedMotion = prefersReducedMotion()
  const isMobile      = useIsMobile()
  const totalImages   = isMobile ? TOTAL_IMAGES_MOBILE : TOTAL_IMAGES_DESKTOP
  const maxScroll     = isMobile ? MAX_SCROLL_MOBILE   : MAX_SCROLL_DESKTOP

  // When reduced-motion is set, skip scatter/line and start in circle immediately.
  const [introPhase, setIntroPhase] = useState(reducedMotion ? 'circle' : 'scatter')
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })
  const containerRef = useRef(null)
  const fileRef      = useRef(null)

  const onFile = (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    const r = new FileReader()
    r.onload = () => {
      const url = typeof r.result === 'string' ? r.result : null
      if (url) onLaunchWithMeme(url)
    }
    r.readAsDataURL(f)
  }

  // Container size tracking
  useEffect(() => {
    if (!containerRef.current) return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerSize({ width: entry.contentRect.width, height: entry.contentRect.height })
      }
    })
    observer.observe(containerRef.current)
    setContainerSize({ width: containerRef.current.offsetWidth, height: containerRef.current.offsetHeight })
    return () => observer.disconnect()
  }, [])

  // Virtual scroll
  const virtualScroll = useMotionValue(0)
  const scrollRef     = useRef(0)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    if (scrollRef.current > maxScroll) {
      scrollRef.current = maxScroll
      virtualScroll.set(maxScroll)
    }

    const handleWheel = (e) => {
      const current  = scrollRef.current
      const proposed = current + e.deltaY
      const clamped  = Math.min(Math.max(proposed, 0), maxScroll)
      if (clamped === current) return
      e.preventDefault()
      scrollRef.current = clamped
      virtualScroll.set(clamped)
    }

    let touchStartY = 0
    const handleTouchStart = (e) => { touchStartY = e.touches[0].clientY }
    const handleTouchMove  = (e) => {
      const touchY   = e.touches[0].clientY
      const deltaY   = touchStartY - touchY
      touchStartY    = touchY
      const current  = scrollRef.current
      const proposed = current + deltaY
      const clamped  = Math.min(Math.max(proposed, 0), maxScroll)
      if (clamped === current) return
      e.preventDefault()
      scrollRef.current = clamped
      virtualScroll.set(clamped)
    }

    container.addEventListener('wheel',       handleWheel,      { passive: false })
    container.addEventListener('touchstart',  handleTouchStart, { passive: false })
    container.addEventListener('touchmove',   handleTouchMove,  { passive: false })
    return () => {
      container.removeEventListener('wheel',      handleWheel)
      container.removeEventListener('touchstart', handleTouchStart)
      container.removeEventListener('touchmove',  handleTouchMove)
    }
  }, [virtualScroll, maxScroll])

  // Springs — stiffer when reduced-motion so the animation completes nearly instantly.
  const springCfg = reducedMotion
    ? { stiffness: 300, damping: 60 }
    : { stiffness: 40,  damping: 20 }

  const morphProgress = useTransform(virtualScroll, [0, 600], [0, 1])
  const smoothMorph   = useSpring(morphProgress, springCfg)

  const scrollRotate = useTransform(virtualScroll, (v) => {
    const t = (v - 600) / Math.max(maxScroll - 600, 1)
    return Math.max(0, Math.min(1, t)) * 360
  })
  const smoothScrollRotate = useSpring(scrollRotate, springCfg)

  // Pointer parallax (desktop only)
  const mouseX      = useMotionValue(0)
  const smoothMouseX = useSpring(mouseX, { stiffness: 30, damping: 20 })
  useEffect(() => {
    if (isMobile) return
    const container = containerRef.current
    if (!container) return
    const handleMouseMove = (e) => {
      const rect        = container.getBoundingClientRect()
      const relativeX   = e.clientX - rect.left
      const normalizedX = (relativeX / rect.width) * 2 - 1
      mouseX.set(normalizedX * 100)
    }
    container.addEventListener('mousemove', handleMouseMove)
    return () => container.removeEventListener('mousemove', handleMouseMove)
  }, [mouseX, isMobile])

  // Intro choreography (skipped when reduced-motion)
  useEffect(() => {
    if (reducedMotion) return
    const t1 = setTimeout(() => setIntroPhase('line'),   500)
    const t2 = setTimeout(() => setIntroPhase('circle'), 2500)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [reducedMotion])

  // Mirror spring values into React state for per-card math
  const [morphValue,    setMorphValue]    = useState(0)
  const [rotateValue,   setRotateValue]   = useState(0)
  const [parallaxValue, setParallaxValue] = useState(0)
  useEffect(() => {
    const a = smoothMorph.on('change', setMorphValue)
    const b = smoothScrollRotate.on('change', setRotateValue)
    const c = isMobile ? () => {} : smoothMouseX.on('change', setParallaxValue)
    return () => { a(); b(); c() }
  }, [smoothMorph, smoothScrollRotate, smoothMouseX, isMobile])

  // CTA fade-in
  const contentOpacity = useTransform(smoothMorph, [0.8, 1], [0, 1])
  const contentY       = useTransform(smoothMorph, [0.8, 1], [20, 0])

  return (
    <div
      ref={containerRef}
      data-testid="scroll-morph-hero"
      className="relative w-full min-h-[100svh] overflow-hidden bg-ink"
    >
      {/* Aurora glow */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-fuchsia/15 blur-2xl sm:blur-3xl" />
        <div className="hidden sm:block absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-acid/10 blur-3xl" />
        <div className="absolute inset-0 bg-grid opacity-40" />
      </div>

      <div className="relative flex min-h-[100svh] w-full flex-col items-center justify-center">
        {/* Pre-morph copy */}
        <div className="absolute z-20 flex flex-col items-center justify-center text-center pointer-events-none inset-0">
          <div className="max-w-3xl px-6">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={
              introPhase === 'circle' && morphValue < 0.5
                ? { opacity: 1 - morphValue * 2, y: 0 }
                : { opacity: 0, y: 12 }
            }
            transition={{ duration: reducedMotion ? 0 : 0.8 }}
            className="inline-flex items-center gap-2 rounded-full bg-white/5 ring-1 ring-white/10 px-3 py-1 backdrop-blur mb-6"
          >
            <span className="relative flex h-1.5 w-1.5">
              {!reducedMotion && (
                <span className="absolute inline-flex h-full w-full rounded-full bg-acid opacity-60 animate-ping" />
              )}
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-acid" />
            </span>
            <span className="text-[11px] uppercase tracking-[0.25em] text-white/70">v0.1.0 · meme studio</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20, filter: 'blur(10px)' }}
            animate={
              introPhase === 'circle' && morphValue < 0.5
                ? { opacity: 1 - morphValue * 2, y: 0, filter: 'blur(0px)' }
                : { opacity: 0, filter: 'blur(10px)' }
            }
            transition={{ duration: reducedMotion ? 0 : 1 }}
            className="font-display tracking-tight leading-[0.95] text-[clamp(2.5rem,9vw,5rem)] text-white"
          >
            meme it{' '}
            <span className="gradient-text">before the moment dies.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={
              introPhase === 'circle' && morphValue < 0.5
                ? { opacity: 0.6 - morphValue }
                : { opacity: 0 }
            }
            transition={{ duration: reducedMotion ? 0 : 1, delay: reducedMotion ? 0 : 0.2 }}
            className="mt-6 text-[10px] sm:text-xs font-bold tracking-[0.35em] text-white/55 uppercase"
          >
            scroll to make one
          </motion.p>
          </div>
        </div>

        {/* Post-morph CTA block */}
        <motion.div
          style={{ opacity: contentOpacity, y: contentY }}
          className="pointer-events-none absolute top-[10%] sm:top-[12%] z-20 flex flex-col items-center justify-center text-center px-4 max-w-2xl"
        >
          <div className="inline-flex items-center gap-2 rounded-full bg-white/[0.04] ring-1 ring-white/10 px-3 py-1 backdrop-blur mb-8">
            <span className="relative flex h-1.5 w-1.5">
              {!reducedMotion && (
                <span className="absolute inline-flex h-full w-full rounded-full bg-acid opacity-60 animate-ping" />
              )}
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-acid" />
            </span>
            <span className="text-[11px] uppercase tracking-[0.25em] text-white/70">memebro · meme studio</span>
          </div>

          <h2 className="font-display tracking-tight leading-[0.95] text-3xl md:text-5xl text-white mb-6">
            drop a meme.{' '}
            <span className="gradient-text">cast a face.</span> ship it.
          </h2>
          <p className="text-sm md:text-base text-white/65 max-w-lg leading-relaxed mb-10">
            Drop any meme you found online, add a face, and MemeBro casts your
            friend straight into it — pose and all.
          </p>

          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
          <div
            className={`flex flex-col sm:flex-row gap-4 ${morphValue > 0.8 ? 'pointer-events-auto' : 'pointer-events-none'}`}
          >
            <Button size="xl" variant="primary" onClick={() => fileRef.current?.click()}>
              <IconUpload /> drop a meme <IconArrowRight />
            </Button>
            <Button size="lg" variant="secondary" onClick={onBrowseTemplates}>
              <IconLayers /> browse templates
            </Button>
          </div>
        </motion.div>

        {/* Card field */}
        <div className="relative flex items-center justify-center w-full h-full">
          {MEMES.slice(0, totalImages).map((meme, i) => {
            const target = computeTarget({
              index:         i,
              introPhase,
              containerSize,
              morphValue,
              rotateValue,
              parallaxValue,
              totalImages,
            })
            return (
              <FlipCard
                key={i}
                src={meme.src}
                name={meme.name}
                target={target}
                simple={isMobile}
              />
            )
          })}
        </div>
      </div>

      {/* Scroll hint */}
      <motion.div
        className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-[0.35em] text-white/35"
        animate={{ opacity: morphValue > 0.05 ? 0 : 1 }}
        transition={{ duration: reducedMotion ? 0 : 0.4 }}
      >
        scroll ↓
      </motion.div>
    </div>
  )
}

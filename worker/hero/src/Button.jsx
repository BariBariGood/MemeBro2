const SIZE_CLASSES = {
  sm:  'px-3 py-1.5 text-sm gap-1.5',
  md:  'px-4 py-2 text-sm gap-2',
  lg:  'px-5 py-2.5 text-base gap-2',
  xl:  'px-6 py-3 text-base gap-2.5',
}

export function Button({ children, size = 'md', variant = 'primary', onClick, className = '' }) {
  const sizeClass = SIZE_CLASSES[size] ?? SIZE_CLASSES.md

  const variantStyle = variant === 'secondary'
    ? {
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.15)',
        color: 'rgba(255,255,255,0.8)',
      }
    : {
        background: 'linear-gradient(90deg, #ff4ec7, #ea44cf)',
        border: 'none',
        color: '#fff',
        boxShadow: '0 10px 30px rgba(255,78,199,0.4)',
      }

  return (
    <button
      type="button"
      onClick={onClick}
      style={variantStyle}
      className={`inline-flex items-center justify-center rounded-full font-semibold transition-opacity duration-200 cursor-pointer hover:opacity-90 ${sizeClass} ${className}`}
    >
      {children}
    </button>
  )
}

export function BrandMark({ compact = false }) {
  return (
    <span className={`brand-mark${compact ? ' brand-mark--compact' : ''}`}>
      <svg
        aria-hidden="true"
        className="brand-mark__icon"
        viewBox="0 0 48 48"
        fill="none"
      >
        <path d="M24 14.5c-4.5-3.3-10.1-4.6-16.5-3.5v24.5c6.4-.9 12 .3 16.5 3.4V14.5Z" />
        <path d="M24 14.5c4.5-3.3 10.1-4.6 16.5-3.5v24.5c-6.4-.9-12 .3-16.5 3.4V14.5Z" />
        <path d="M12 17.5c3.2-.1 6 .5 8.7 1.7M12 23c3.2-.1 6 .5 8.7 1.7" />
        <path d="M36 17.5c-3.2-.1-6 .5-8.7 1.7M36 23c-3.2-.1-6 .5-8.7 1.7" />
      </svg>
      {!compact && <span className="brand-mark__name">Story Sphere</span>}
    </span>
  )
}

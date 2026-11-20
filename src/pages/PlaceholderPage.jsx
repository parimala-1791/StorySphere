import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

export function PlaceholderPage({ eyebrow, title, description }) {
  return (
    <section aria-labelledby="placeholder-title" className="placeholder-page">
      <p className="eyebrow">
        <span className="eyebrow__rule" />
        {eyebrow}
      </p>
      <h1 id="placeholder-title">{title}</h1>
      <p className="placeholder-page__description">{description}</p>
      <Link className="text-link" to="/">
        <ArrowLeft aria-hidden="true" size={16} />
        Back to the beginning
      </Link>
    </section>
  )
}

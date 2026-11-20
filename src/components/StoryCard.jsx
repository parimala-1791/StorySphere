import { useState } from 'react'
import { ArrowUpRight, BookOpen, Heart, MessageCircle } from 'lucide-react'
import { Link } from 'react-router-dom'

function formatDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'Publication date unavailable'
  }

  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

function CoverArt({ story }) {
  const [imageFailed, setImageFailed] = useState(false)

  if (story.cover_url && !imageFailed) {
    return (
      <img
        alt=""
        className="story-card__image"
        loading="lazy"
        onError={() => setImageFailed(true)}
        src={story.cover_url}
      />
    )
  }

  if (story.cover_error || imageFailed) {
    return (
      <div className="story-card__cover-fallback" role="status">
        <BookOpen aria-hidden="true" size={29} />
        <span>Cover unavailable</span>
      </div>
    )
  }

  return (
    <div className="story-card__cover-fallback story-card__cover-fallback--empty">
      <BookOpen aria-hidden="true" size={29} />
      <span>A story to discover</span>
    </div>
  )
}

export function StoryCard({ story, featured = false }) {
  const categories =
    Array.isArray(story.category_names) && story.category_names.length
      ? story.category_names.map((name, index) => ({
          name,
          slug: story.category_slugs?.[index] || '',
        }))
      : story.category_name
        ? [{ name: story.category_name, slug: story.category_slug || '' }]
        : []

  return (
    <article className={`story-card${featured ? ' story-card--featured' : ''}`}>
      <Link
        aria-label={`Read ${story.story_title}`}
        className="story-card__cover"
        to={`/story/${story.story_slug}`}
      >
        <CoverArt story={story} />
      </Link>
      <div className="story-card__body">
        <div className="story-card__meta">
          <Link
            aria-label={`Read ${story.author_full_name}'s profile`}
            className="story-card__author"
            onClick={(event) => event.stopPropagation()}
            to={`/writers/${story.author_username}`}
          >
            By {story.author_full_name}
          </Link>
          <span aria-hidden="true" className="story-card__meta-dot" />
          <time dateTime={story.story_published_at}>{formatDate(story.story_published_at)}</time>
        </div>
        {categories.length > 0 && (
          <div aria-label="Story categories" className="story-card__categories">
            {categories.map((category) =>
              category.slug ? (
                <Link
                  className="story-card__category"
                  key={category.slug}
                  to={`/explore?category=${encodeURIComponent(category.slug)}`}
                >
                  {category.name}
                </Link>
              ) : (
                <span className="story-card__category" key={category.name}>
                  {category.name}
                </span>
              ),
            )}
          </div>
        )}
        <h3 className="story-card__title">
          <Link to={`/story/${story.story_slug}`}>{story.story_title}</Link>
        </h3>
        {story.story_excerpt ? (
          <p className="story-card__excerpt">{story.story_excerpt}</p>
        ) : (
          <p className="story-card__excerpt story-card__excerpt--empty">
            No summary provided.
          </p>
        )}
        <div className="story-card__footer">
          <div aria-label={`${story.likes_count} likes and ${story.comments_count} comments`} className="story-card__engagement">
            <span>
              <Heart aria-hidden="true" size={14} />
              {story.likes_count}
            </span>
            <span>
              <MessageCircle aria-hidden="true" size={14} />
              {story.comments_count}
            </span>
          </div>
          <Link className="story-card__read" to={`/story/${story.story_slug}`}>
            Read story <ArrowUpRight aria-hidden="true" size={15} />
          </Link>
        </div>
      </div>
    </article>
  )
}

export function StoryGrid({ stories, featured = false }) {
  return (
    <div className="story-grid">
      {stories.map((story) => (
        <StoryCard featured={featured} key={story.story_id} story={story} />
      ))}
    </div>
  )
}

export function StoryGridSkeleton({ count = 3 }) {
  return (
    <div aria-hidden="true" className="story-grid">
      {Array.from({ length: count }, (_, index) => (
        <div className="story-card story-card--skeleton" key={index}>
          <div className="skeleton story-card__cover" />
          <div className="story-card__body">
            <div className="skeleton skeleton-line skeleton-line--short" />
            <div className="skeleton skeleton-line skeleton-line--title" />
            <div className="skeleton skeleton-line" />
            <div className="skeleton skeleton-line skeleton-line--medium" />
          </div>
        </div>
      ))}
    </div>
  )
}

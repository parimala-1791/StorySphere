import { useEffect, useState } from 'react'
import { ArrowRight, BookOpen, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { BrandMark } from '../components/BrandMark.jsx'
import { StoryGrid, StoryGridSkeleton } from '../components/StoryCard.jsx'
import { fetchCategories, fetchStoryFeed } from '../services/storyFeed.js'

function errorText(error) {
  return error instanceof Error ? error.message : 'An unexpected error occurred.'
}

function StorySection({ id, eyebrow, title, state, onRetry }) {
  return (
    <section aria-labelledby={`${id}-title`} className="story-section">
      <div className="story-section__header">
        <div>
          <p className="eyebrow">
            <span className="eyebrow__rule" />
            {eyebrow}
          </p>
          <h2 id={`${id}-title`}>{title}</h2>
        </div>
        <Link className="text-link" to="/explore">
          Explore all <ArrowRight aria-hidden="true" size={16} />
        </Link>
      </div>

      {state.loading ? (
        <StoryGridSkeleton count={3} />
      ) : state.error ? (
        <div className="feed-message feed-message--error" role="alert">
          <p>We could not load {title.toLowerCase()}: {state.error}</p>
          <button className="text-link feed-message__retry" onClick={onRetry} type="button">
            Try again
          </button>
        </div>
      ) : state.items.length === 0 ? (
        <div className="feed-message">
          <BookOpen aria-hidden="true" size={21} />
          <p>No stories in this collection yet. Published stories will appear here.</p>
        </div>
      ) : (
        <StoryGrid stories={state.items} />
      )}
    </section>
  )
}

export function HomePage() {
  const [retryCount, setRetryCount] = useState(0)
  const [showAllCategories, setShowAllCategories] = useState(false)
  const [homeData, setHomeData] = useState({
    trending: { items: [], loading: true, error: '' },
    recent: { items: [], loading: true, error: '' },
    categories: { items: [], loading: true, error: '' },
  })

  useEffect(() => {
    let active = true
    const requests = {
      trending: fetchStoryFeed({ sort: 'popular', limit: 3 }),
      recent: fetchStoryFeed({ sort: 'newest', limit: 3, recentDays: 30 }),
      categories: fetchCategories(),
    }

    Promise.all(
      Object.entries(requests).map(async ([name, request]) => {
        try {
          return [name, { items: await request, loading: false, error: '' }]
        } catch (error) {
          return [name, { items: [], loading: false, error: errorText(error) }]
        }
      }),
    ).then((results) => {
      if (active) {
        setHomeData(Object.fromEntries(results))
      }
    })

    return () => {
      active = false
    }
  }, [retryCount])

  return (
    <div className="home-page">
      <section aria-labelledby="home-title" className="hero">
        <div className="hero__copy">
          <p className="eyebrow">
            <span className="eyebrow__rule" />
            A community storytelling space
          </p>
          <h1 id="home-title">
            Where Every Story <em>Finds Its Home.</em>
          </h1>
          <p className="hero__description">
            Discover stories, share your imagination, and connect with people through
            the power of words.
          </p>
          <div className="hero__actions">
            <Link className="button" to="/explore">
              Explore stories <ArrowRight aria-hidden="true" size={17} />
            </Link>
            <Link className="text-link" to="/write">
              Share your story <ArrowRight aria-hidden="true" size={16} />
            </Link>
          </div>
          <p className="hero__tagline">
            Every Story Deserves a Space. Every Voice Deserves to Be Heard.
          </p>
        </div>

        <div
          aria-label="An open book surrounded by the stories of a community"
          className="hero-art"
          role="img"
        >
          <div className="hero-art__orbit hero-art__orbit--outer" />
          <div className="hero-art__orbit hero-art__orbit--inner" />
          <div className="hero-art__sphere">
            <BrandMark compact />
          </div>
          <div className="hero-note hero-note--top">
            <Sparkles aria-hidden="true" className="hero-note__spark" size={14} />
            <span>your voice belongs</span>
          </div>
          <div className="hero-note hero-note--bottom">
            <span className="hero-note__line" />
            <span>stories bring us closer</span>
          </div>
          <Sparkles
            aria-hidden="true"
            className="hero-art__star hero-art__star--one"
            size={18}
          />
          <Sparkles
            aria-hidden="true"
            className="hero-art__star hero-art__star--two"
            size={14}
          />
        </div>
      </section>

      <div className="home-content">
        <StorySection
          eyebrow="Finding their readers"
          id="trending"
          onRetry={() => setRetryCount((count) => count + 1)}
          state={homeData.trending}
          title="Trending this month"
        />

        {homeData.categories.loading ? (
          <section aria-label="Loading categories" className="category-section">
            <div className="skeleton skeleton-line skeleton-line--short" />
            <div className="category-skeletons">
              {[0, 1, 2, 3].map((item) => (
                <span className="skeleton category-skeleton" key={item} />
              ))}
            </div>
          </section>
        ) : homeData.categories.error ? (
          <section className="category-section">
            <p className="eyebrow">
              <span className="eyebrow__rule" />
              Find your next read
            </p>
            <div className="feed-message feed-message--error" role="alert">
              <p>We could not load categories: {homeData.categories.error}</p>
              <button
                className="text-link feed-message__retry"
                onClick={() => setRetryCount((count) => count + 1)}
                type="button"
              >
                Try again
              </button>
            </div>
          </section>
        ) : (
          <section aria-labelledby="categories-title" className="category-section">
            <div className="story-section__header">
              <div>
                <p className="eyebrow">
                  <span className="eyebrow__rule" />
                  Follow a feeling
                </p>
                <h2 id="categories-title">Explore by category</h2>
              </div>
            </div>
            {homeData.categories.items.length ? (
              <>
                <div className="category-list" id="home-categories-list">
                  {homeData.categories.items
                    .slice(0, showAllCategories ? homeData.categories.items.length : 8)
                    .map((category) => (
                      <Link
                        className="category-card"
                        key={category.id}
                        to={`/explore?category=${encodeURIComponent(category.slug)}`}
                      >
                        <span className="category-card__name">{category.name}</span>
                        <span className="category-card__description">
                          {category.description || 'Stories from the community.'}
                        </span>
                        <ArrowRight aria-hidden="true" size={16} />
                      </Link>
                    ))}
                </div>
                {homeData.categories.items.length > 8 && (
                  <button
                    aria-controls="home-categories-list"
                    aria-expanded={showAllCategories}
                    className="text-link category-view-all"
                    onClick={() => setShowAllCategories((current) => !current)}
                    type="button"
                  >
                    {showAllCategories ? 'Show fewer categories' : 'View All Categories'}
                  </button>
                )}
              </>
            ) : (
              <div className="feed-message">
                <p>No active categories are available yet.</p>
              </div>
            )}
          </section>
        )}

        <StorySection
          eyebrow="Fresh from the community"
          id="recent"
          onRetry={() => setRetryCount((count) => count + 1)}
          state={homeData.recent}
          title="Recently published"
        />

        <section aria-labelledby="community-title" className="community-invite">
          <div className="community-invite__mark">
            <BrandMark compact />
          </div>
          <div>
            <p className="eyebrow">
              <span className="eyebrow__rule" />
              A space for every voice
            </p>
            <h2 id="community-title">Your words belong in the conversation.</h2>
            <p>
              Join readers and writers who believe that a shared story can make us
              feel a little less alone.
            </p>
          </div>
          <Link className="button" to="/sign-up">
            Join the community <ArrowRight aria-hidden="true" size={17} />
          </Link>
        </section>
      </div>
    </div>
  )
}

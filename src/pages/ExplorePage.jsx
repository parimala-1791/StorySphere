import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDownWideNarrow, BookOpen, LoaderCircle, Search, X } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { StoryGrid, StoryGridSkeleton } from '../components/StoryCard.jsx'
import { fetchCategories, fetchStoryFeed } from '../services/storyFeed.js'

const PAGE_SIZE = 12

function errorText(error) {
  return error instanceof Error ? error.message : 'An unexpected error occurred.'
}

export function ExplorePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedCategorySlugs = useMemo(
    () => [...new Set(searchParams.getAll('category').filter(Boolean))],
    [searchParams],
  )
  const [categoryRetry, setCategoryRetry] = useState(0)
  const [categoryResult, setCategoryResult] = useState({
    retry: -1,
    items: [],
    error: '',
  })
  const [searchText, setSearchText] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [sort, setSort] = useState('newest')
  const [reloadCount, setReloadCount] = useState(0)
  const [feedResult, setFeedResult] = useState({
    requestKey: '',
    stories: [],
    error: '',
    hasMore: false,
    loadMoreError: '',
  })
  const [loadingMoreKey, setLoadingMoreKey] = useState('')
  const requestVersion = useRef(0)

  const requestKey = JSON.stringify([
    debouncedSearch,
    selectedCategorySlugs,
    sort,
    reloadCount,
  ])
  const categoriesLoading = categoryResult.retry !== categoryRetry
  const categories = categoriesLoading ? [] : categoryResult.items
  const categoriesError = categoriesLoading ? '' : categoryResult.error
  const isLoading = feedResult.requestKey !== requestKey
  const stories = isLoading ? [] : feedResult.stories
  const storiesError = isLoading ? '' : feedResult.error
  const hasMore = !isLoading && feedResult.hasMore
  const loadMoreError = isLoading ? '' : feedResult.loadMoreError
  const isLoadingMore = loadingMoreKey === requestKey

  useEffect(() => {
    let active = true

    fetchCategories()
      .then((items) => {
        if (active) {
          setCategoryResult({ retry: categoryRetry, items, error: '' })
        }
      })
      .catch((error) => {
        if (active) {
          setCategoryResult({
            retry: categoryRetry,
            items: [],
            error: errorText(error),
          })
        }
      })

    return () => {
      active = false
    }
  }, [categoryRetry])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(searchText.trim())
    }, 250)

    return () => window.clearTimeout(timeout)
  }, [searchText])

  function setCategorySelection(categorySlug, selected) {
    const nextParams = new URLSearchParams(searchParams)
    const nextCategories = new Set(nextParams.getAll('category').filter(Boolean))
    if (selected) {
      nextCategories.add(categorySlug)
    } else {
      nextCategories.delete(categorySlug)
    }
    nextParams.delete('category')
    for (const slug of nextCategories) {
      nextParams.append('category', slug)
    }
    setSearchParams(nextParams, { replace: true })
  }

  function clearCategorySelection() {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('category')
    setSearchParams(nextParams, { replace: true })
  }

  useEffect(() => {
    let active = true
    const version = ++requestVersion.current

    fetchStoryFeed({
      search: debouncedSearch || null,
      categorySlugs: selectedCategorySlugs,
      sort,
      limit: PAGE_SIZE,
    })
      .then((items) => {
        if (active && requestVersion.current === version) {
          setFeedResult({
            requestKey,
            stories: items,
            error: '',
            hasMore: items.length === PAGE_SIZE,
            loadMoreError: '',
          })
        }
      })
      .catch((error) => {
        if (active && requestVersion.current === version) {
          setFeedResult({
            requestKey,
            stories: [],
            error: errorText(error),
            hasMore: false,
            loadMoreError: '',
          })
        }
      })

    return () => {
      active = false
    }
  }, [debouncedSearch, selectedCategorySlugs, sort, reloadCount, requestKey])

  async function handleLoadMore() {
    if (isLoadingMore || !hasMore) {
      return
    }

    const version = requestVersion.current
    const offset = stories.length
    setLoadingMoreKey(requestKey)

    try {
      const nextStories = await fetchStoryFeed({
        search: debouncedSearch || null,
        categorySlugs: selectedCategorySlugs,
        sort,
        limit: PAGE_SIZE,
        offset,
      })
      if (version === requestVersion.current) {
        setFeedResult((current) =>
          current.requestKey === requestKey
            ? {
                ...current,
                stories: [...current.stories, ...nextStories],
                hasMore: nextStories.length === PAGE_SIZE,
                loadMoreError: '',
              }
            : current,
        )
      }
    } catch (error) {
      if (version === requestVersion.current) {
        setFeedResult((current) =>
          current.requestKey === requestKey
            ? { ...current, loadMoreError: errorText(error) }
            : current,
        )
      }
    } finally {
      if (version === requestVersion.current) {
        setLoadingMoreKey('')
      }
    }
  }

  const hasActiveFilters = Boolean(
    debouncedSearch || selectedCategorySlugs.length || sort !== 'newest',
  )

  function clearFilters() {
    setSearchText('')
    setDebouncedSearch('')
    setSort('newest')
    clearCategorySelection()
  }

  return (
    <div className="explore-page">
      <header className="explore-heading">
        <p className="eyebrow">
          <span className="eyebrow__rule" />
          A world of voices
        </p>
        <h1>Explore stories</h1>
        <p>Follow a question, a feeling, or a voice you have not heard before.</p>
      </header>

      <section aria-label="Find stories" className="explore-controls">
        <label className="explore-search">
          <Search aria-hidden="true" size={19} />
          <input
            aria-label="Search stories by title, author, keywords, or category"
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Search stories, writers, categories, or ideas"
            type="search"
            value={searchText}
          />
          {searchText && (
            <button
              aria-label="Clear search"
              className="explore-search__clear"
              onClick={() => setSearchText('')}
              type="button"
            >
              <X aria-hidden="true" size={17} />
            </button>
          )}
        </label>

        <div className="explore-filter">
          <span>Categories</span>
          <details className="explore-category-filter">
            <summary
              aria-disabled={categoriesLoading || Boolean(categoriesError)}
              onClick={(event) => {
                if (categoriesLoading || categoriesError) {
                  event.preventDefault()
                }
              }}
            >
              {categoriesLoading
                ? 'Loading categories…'
                : selectedCategorySlugs.length
                  ? `${selectedCategorySlugs.length} selected`
                  : 'All categories'}
            </summary>
            <div className="explore-category-filter__options">
              {categories.map((category) => (
                <label className="explore-category-filter__option" key={category.id}>
                  <input
                    checked={selectedCategorySlugs.includes(category.slug)}
                    disabled={categoriesLoading || Boolean(categoriesError)}
                    onChange={(event) =>
                      setCategorySelection(category.slug, event.target.checked)
                    }
                    type="checkbox"
                  />
                  {category.name}
                </label>
              ))}
            </div>
          </details>
        </div>

        <label className="explore-filter">
          <span>Sort by</span>
          <span className="explore-filter__select">
            <ArrowDownWideNarrow aria-hidden="true" size={16} />
            <select onChange={(event) => setSort(event.target.value)} value={sort}>
              <option value="newest">Newest</option>
              <option value="popular">Most popular</option>
            </select>
          </span>
        </label>
      </section>

      {categoriesError && (
        <div className="feed-message feed-message--error" role="alert">
          <p>Categories could not be loaded: {categoriesError}</p>
          <button
            className="text-link feed-message__retry"
            onClick={() => setCategoryRetry((count) => count + 1)}
            type="button"
          >
            Retry categories
          </button>
        </div>
      )}

      <div aria-live="polite" className="explore-results-heading">
        <p>
          {isLoading
            ? 'Finding stories…'
            : `${stories.length} ${stories.length === 1 ? 'story' : 'stories'} shown`}
        </p>
        {hasActiveFilters && (
          <button className="text-link" onClick={clearFilters} type="button">
            Clear filters <X aria-hidden="true" size={15} />
          </button>
        )}
      </div>

      {isLoading ? (
        <StoryGridSkeleton count={6} />
      ) : storiesError ? (
        <div className="feed-message feed-message--error" role="alert">
          <p>Stories could not be loaded: {storiesError}</p>
          <button
            className="text-link feed-message__retry"
            onClick={() => setReloadCount((count) => count + 1)}
            type="button"
          >
            Retry search
          </button>
        </div>
      ) : stories.length ? (
        <>
          <StoryGrid stories={stories} />
          {loadMoreError && (
            <div className="feed-message feed-message--error" role="alert">
              <p>More stories could not be loaded: {loadMoreError}</p>
              <button className="text-link" onClick={handleLoadMore} type="button">
                Try again
              </button>
            </div>
          )}
          {hasMore && (
            <div className="explore-load-more">
              <button
                className="button button--outline"
                disabled={isLoadingMore}
                onClick={handleLoadMore}
                type="button"
              >
                {isLoadingMore ? (
                  <>
                    <LoaderCircle aria-hidden="true" className="auth-loading__icon" size={17} />
                    Loading stories…
                  </>
                ) : (
                  'Load more stories'
                )}
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="explore-empty">
          <BookOpen aria-hidden="true" size={30} />
          <h2>{hasActiveFilters ? 'No stories match those filters.' : 'The reading room is quiet for now.'}</h2>
          <p>
            {hasActiveFilters
              ? 'Try another search or clear the filters to see all published stories.'
              : 'Published community stories will appear here as writers share them.'}
          </p>
          {hasActiveFilters && (
            <button className="text-link" onClick={clearFilters} type="button">
              Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  )
}

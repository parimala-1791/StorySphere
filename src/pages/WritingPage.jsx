import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Check,
  Eye,
  ImagePlus,
  LoaderCircle,
  Save,
  Send,
  Trash2,
  X,
} from 'lucide-react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth.js'
import {
  createWriterDraft,
  deleteWriterStory,
  fetchWriterStory,
  fetchWritingOptions,
  removeWriterCover,
  STORY_COVER_LIMIT,
  STORY_COVER_TYPES,
  syncWriterStoryCategories,
  syncWriterStoryTags,
  updateWriterStory,
  uploadWriterCover,
} from '../services/storyWriter.js'

function errorText(error) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}

function slugFromFileName(fileName) {
  return fileName.replace(/\.[^.]+$/, '')
}

function wordCount(value) {
  return value.trim().split(/\s+/).filter(Boolean).length
}

function formatDate(value) {
  if (!value) {
    return ''
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  return new Intl.DateTimeFormat('en', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

function WritingCover({ url, title, compact = false }) {
  const [failed, setFailed] = useState(false)

  if (url && !failed) {
    return (
      <img
        alt={title ? `Cover for ${title}` : 'Story cover preview'}
        className={`writing-cover-image${compact ? ' writing-cover-image--compact' : ''}`}
        onError={() => setFailed(true)}
        src={url}
      />
    )
  }

  return (
    <div className={`writing-cover-empty${compact ? ' writing-cover-empty--compact' : ''}`}>
      <BookOpen aria-hidden="true" size={compact ? 25 : 34} />
      <span>{failed ? 'Cover preview unavailable' : 'Your cover will appear here'}</span>
    </div>
  )
}

export function WritingPage() {
  const { slug } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [optionsAttempt, setOptionsAttempt] = useState(0)
  const [optionsResult, setOptionsResult] = useState({
    attempt: -1,
    categories: [],
    tags: [],
    error: '',
  })
  const optionsLoading = optionsResult.attempt !== optionsAttempt
  const categories = optionsLoading ? [] : optionsResult.categories
  const tags = optionsLoading ? [] : optionsResult.tags
  const optionsError = optionsLoading ? '' : optionsResult.error
  const [storyResult, setStoryResult] = useState({ slug: '', story: null, error: '' })
  const [createdStory, setCreatedStory] = useState(null)
  const isLoadingStory = Boolean(slug) && storyResult.slug !== slug
  const story =
    slug && !isLoadingStory ? storyResult.story : slug ? null : createdStory
  const storyError = slug && !isLoadingStory ? storyResult.error : ''
  const categoryChoices = [
    ...categories,
    ...(story?.categories || []).filter(
      (assignedCategory) =>
        !categories.some((category) => category.id === assignedCategory.id),
    ),
  ]
  const [fields, setFields] = useState({
    title: '',
    excerpt: '',
    content: '',
  })
  const [selectedCategoryIds, setSelectedCategoryIds] = useState([])
  const [selectedTagIds, setSelectedTagIds] = useState([])
  const [coverFile, setCoverFile] = useState(null)
  const [coverPreview, setCoverPreview] = useState('')
  const [existingCoverUrl, setExistingCoverUrl] = useState('')
  const [removeCover, setRemoveCover] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [saveMessage, setSaveMessage] = useState(
    () => location.state?.writerNotice || null,
  )
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deletedMessage, setDeletedMessage] = useState('')
  const coverPreviewRef = useRef('')

  const wordTotal = wordCount(fields.content)
  const coverUrl = coverPreview || (removeCover ? '' : existingCoverUrl)
  const canSave = !isSaving && !isDeleting && !optionsLoading && !optionsError && !isLoadingStory

  useEffect(() => {
    let active = true

    fetchWritingOptions()
      .then(({ categories: loadedCategories, tags: loadedTags }) => {
        if (active) {
          setOptionsResult({
            attempt: optionsAttempt,
            categories: loadedCategories,
            tags: loadedTags,
            error: '',
          })
        }
      })
      .catch((error) => {
        if (active) {
          setOptionsResult({
            attempt: optionsAttempt,
            categories: [],
            tags: [],
            error: errorText(error),
          })
        }
      })

    return () => {
      active = false
    }
  }, [optionsAttempt])

  useEffect(() => {
    if (
      !slug ||
      (storyResult.slug === slug && (storyResult.story || storyResult.error))
    ) {
      return undefined
    }

    let active = true
    fetchWriterStory(slug, user.id)
      .then((loadedStory) => {
        if (!active) {
          return
        }
        if (!loadedStory) {
          setStoryResult({
            slug,
            story: null,
            error: 'This story was not found in your writing space.',
          })
          return
        }

        setStoryResult({ slug, story: loadedStory, error: '' })
        setFields({
          title: loadedStory.title,
          excerpt: loadedStory.excerpt,
          content: loadedStory.content,
        })
        setSelectedCategoryIds(loadedStory.category_ids)
        setSelectedTagIds(loadedStory.tag_ids)
        setExistingCoverUrl(loadedStory.cover_url)
        setCoverFile(null)
        setRemoveCover(false)
        if (coverPreviewRef.current) {
          URL.revokeObjectURL(coverPreviewRef.current)
          coverPreviewRef.current = ''
        }
        setCoverPreview('')
      })
      .catch((error) => {
        if (active) {
          setStoryResult({ slug, story: null, error: errorText(error) })
        }
      })

    return () => {
      active = false
    }
  }, [slug, storyResult, user.id])

  useEffect(
    () => () => {
      if (coverPreviewRef.current) {
        URL.revokeObjectURL(coverPreviewRef.current)
      }
    },
    [],
  )

  function updateField(name, value) {
    setFields((current) => ({ ...current, [name]: value }))
    setSaveMessage(null)
  }

  function handleCoverChange(event) {
    const file = event.target.files?.[0]
    setSaveMessage(null)

    if (!file) {
      return
    }

    if (!STORY_COVER_TYPES[file.type]) {
      setSaveMessage({
        type: 'error',
        text: 'Choose an AVIF, JPEG, PNG, or WebP cover image.',
      })
      event.target.value = ''
      return
    }
    if (file.size > STORY_COVER_LIMIT) {
      setSaveMessage({
        type: 'error',
        text: 'Story cover images must be 5 MB or smaller.',
      })
      event.target.value = ''
      return
    }

    if (coverPreviewRef.current) {
      URL.revokeObjectURL(coverPreviewRef.current)
      coverPreviewRef.current = ''
    }
    setCoverFile(file)
    setRemoveCover(false)
    coverPreviewRef.current = URL.createObjectURL(file)
    setCoverPreview(coverPreviewRef.current)
  }

  function toggleTag(tagId) {
    setSelectedTagIds((current) =>
      current.includes(tagId)
        ? current.filter((value) => value !== tagId)
        : [...current, tagId],
    )
    setSaveMessage(null)
  }

  function toggleCategory(categoryId) {
    setSelectedCategoryIds((current) =>
      current.includes(categoryId)
        ? current.filter((value) => value !== categoryId)
        : [...current, categoryId],
    )
    setSaveMessage(null)
  }

  async function handleSave(targetStatus) {
    setSaveMessage(null)

    const title = fields.title.trim()
    const excerpt = fields.excerpt.trim()
    const content = fields.content.trim()
    if (!title || title.length > 160) {
      setSaveMessage({
        type: 'error',
        text: 'Enter a story title using 1 to 160 characters.',
      })
      return
    }
    if (excerpt.length > 500) {
      setSaveMessage({
        type: 'error',
        text: 'The story summary must be 500 characters or fewer.',
      })
      return
    }
    if (targetStatus === 'published' && !content) {
      setSaveMessage({
        type: 'error',
        text: 'Add your story text before publishing.',
      })
      return
    }
    const existingCategoryIds = story?.category_ids || []
    if (
      selectedCategoryIds.some(
        (categoryId) =>
          !categories.some((category) => category.id === categoryId) &&
          !existingCategoryIds.includes(categoryId),
      )
    ) {
      setSaveMessage({
        type: 'error',
        text: 'Choose active categories or keep the existing inactive assignments.',
      })
      return
    }
    if (selectedTagIds.some((tagId) => !tags.some((tag) => tag.id === tagId))) {
      setSaveMessage({
        type: 'error',
        text: 'One or more selected tags are no longer available. Review your tag choices.',
      })
      return
    }

    setIsSaving(true)
    const isNewStory = !slug
    let savedStory = story
    let storySaved = false
    let uploadedPath = ''
    let coverAttached = false
    let cleanupNotice = ''
    const oldCoverPath = story?.cover_path || ''
    const values = {
      title,
      excerpt,
      content: fields.content,
      categoryIds: selectedCategoryIds,
    }

    try {
      if (!savedStory) {
        savedStory = await createWriterDraft(user.id, values)
        storySaved = true
        setCreatedStory(savedStory)
      }

      if (coverFile) {
        uploadedPath = await uploadWriterCover(user.id, savedStory.id, coverFile)
      }

      const nextCoverPath = removeCover
        ? null
        : uploadedPath || savedStory.cover_path || null

      if (story || uploadedPath || removeCover) {
        savedStory = await updateWriterStory(savedStory.id, user.id, {
          ...values,
          status: isNewStory ? 'draft' : targetStatus,
          coverPath: nextCoverPath,
        })
        storySaved = true
        coverAttached = Boolean(uploadedPath)
        if (isNewStory) {
          setCreatedStory(savedStory)
        } else {
          savedStory = {
            ...savedStory,
            categories: story.categories,
            category_ids: story.category_ids,
          }
          setStoryResult({ slug: savedStory.slug, story: savedStory, error: '' })
        }
        if (uploadedPath) {
          setExistingCoverUrl(coverPreview)
          setCoverFile(null)
          setCoverPreview('')
        }
      }

      if ((removeCover || uploadedPath) && oldCoverPath) {
        if (removeCover) {
          setExistingCoverUrl('')
          setRemoveCover(false)
        }
        try {
          await removeWriterCover(oldCoverPath)
        } catch (error) {
          cleanupNotice = ` The previous cover could not be removed: ${errorText(error)}`
        }
      } else if (removeCover) {
        setExistingCoverUrl('')
        setRemoveCover(false)
      }

      await syncWriterStoryCategories(savedStory.id, selectedCategoryIds)
      savedStory = {
        ...savedStory,
        category_id: selectedCategoryIds[0] || null,
        category_ids: selectedCategoryIds,
        categories: categoryChoices.filter((category) =>
          selectedCategoryIds.includes(category.id),
        ),
      }
      if (isNewStory) {
        setCreatedStory(savedStory)
      } else {
        setStoryResult({ slug: savedStory.slug, story: savedStory, error: '' })
      }

      await syncWriterStoryTags(savedStory.id, selectedTagIds)

      if (isNewStory && targetStatus === 'published') {
        savedStory = await updateWriterStory(savedStory.id, user.id, {
          ...values,
          status: 'published',
          coverPath: nextCoverPath,
        })
        storySaved = true
        setCreatedStory(savedStory)
      }

      if (isNewStory) {
        setCreatedStory(savedStory)
        setStoryResult({ slug: savedStory.slug, story: savedStory, error: '' })
      }

      setCoverPreview('')
      const notice = {
        type: cleanupNotice ? 'error' : 'success',
        text: `${targetStatus === 'published' ? 'Your story is published.' : 'Your draft is saved.'}${cleanupNotice}`,
      }
      setSaveMessage(notice)
      if (isNewStory) {
        navigate(`/write/${savedStory.slug}`, {
          replace: true,
          state: { writerNotice: notice },
        })
      }
    } catch (error) {
      let message = `${errorText(error)}${cleanupNotice}`
      if (uploadedPath && !coverAttached) {
        try {
          await removeWriterCover(uploadedPath)
        } catch (cleanupError) {
          message += ` The uploaded cover could not be removed: ${errorText(cleanupError)}`
        }
        if (isNewStory && storySaved && savedStory) {
          setCreatedStory(savedStory)
        }
      }

      setSaveMessage({
        type: 'error',
        text: storySaved
          ? `Your story record was saved, but the remaining save steps failed: ${message}`
          : message,
      })
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete() {
    if (!story || !window.confirm('Delete this story permanently? This cannot be undone.')) {
      return
    }

    setIsDeleting(true)
    setSaveMessage(null)
    try {
      const cleanupWarning = await deleteWriterStory(story, user.id)
      setDeletedMessage(cleanupWarning || 'Your story was deleted.')
    } catch (error) {
      setSaveMessage({ type: 'error', text: errorText(error) })
    } finally {
      setIsDeleting(false)
    }
  }

  function startAnotherStory() {
    if (coverPreviewRef.current) {
      URL.revokeObjectURL(coverPreviewRef.current)
      coverPreviewRef.current = ''
    }
    setCreatedStory(null)
    setStoryResult({ slug: '', story: null, error: '' })
    setFields({ title: '', excerpt: '', content: '' })
    setSelectedCategoryIds([])
    setSelectedTagIds([])
    setCoverFile(null)
    setCoverPreview('')
    setExistingCoverUrl('')
    setRemoveCover(false)
    setSaveMessage(null)
    setDeletedMessage('')
    setShowPreview(false)
  }

  if (optionsLoading || isLoadingStory) {
    return (
      <div aria-busy="true" className="auth-loading writing-loading">
        <LoaderCircle aria-hidden="true" className="auth-loading__icon" size={24} />
        <span>{isLoadingStory ? 'Opening your draft…' : 'Preparing your writing space…'}</span>
      </div>
    )
  }

  if (storyError) {
    return (
      <section className="writing-state" role="alert">
        <p className="eyebrow">
          <span className="eyebrow__rule" />
          Your writing space
        </p>
        <h1>We could not open this story.</h1>
        <p>{storyError}</p>
        <Link className="button button--outline" onClick={startAnotherStory} to="/write">
          Start a new story
        </Link>
      </section>
    )
  }

  if (deletedMessage) {
    return (
      <section className="writing-state writing-state--success" role="status">
        <p className="eyebrow">
          <span className="eyebrow__rule" />
          Your writing space
        </p>
        <h1>Your story has been removed.</h1>
        <p>{deletedMessage}</p>
        <div className="writing-state__actions">
          <Link className="button" onClick={startAnotherStory} to="/write">
            Start another story
          </Link>
          <Link className="text-link" to="/explore">
            Explore stories <ArrowUpRight aria-hidden="true" size={15} />
          </Link>
        </div>
      </section>
    )
  }

  if (optionsError) {
    return (
      <section className="writing-state" role="alert">
        <p className="eyebrow">
          <span className="eyebrow__rule" />
          Your writing space
        </p>
        <h1>Writing options are unavailable.</h1>
        <p>{optionsError}</p>
        <button
          className="button button--outline"
          onClick={() => setOptionsAttempt((attempt) => attempt + 1)}
          type="button"
        >
          Try again
        </button>
      </section>
    )
  }

  const published = story?.status === 'published'

  return (
    <section className="writing-page">
      <header className="writing-page__intro">
        <p className="eyebrow">
          <span className="eyebrow__rule" />
          A room of your own
        </p>
        <h1>{story ? 'Keep shaping your story.' : 'Make room for your story.'}</h1>
        <p>
          Take your time. Save a draft when you need a pause, or preview your words before
          sharing them with the community.
        </p>
        {story && (
          <div className="writing-page__status">
            <span className={`writing-status${published ? ' writing-status--published' : ''}`}>
              {published ? 'Published' : 'Draft'}
            </span>
            {story.updated_at && <span>Last saved {formatDate(story.updated_at)}</span>}
          </div>
        )}
      </header>

      <div className="writing-layout">
        <div className="writing-main">
          <div aria-label="Writing mode" className="writing-mode">
            <button
              aria-pressed={!showPreview}
              className={!showPreview ? 'writing-mode__active' : ''}
              onClick={() => setShowPreview(false)}
              type="button"
            >
              <BookOpen aria-hidden="true" size={16} />
              Write
            </button>
            <button
              aria-pressed={showPreview}
              className={showPreview ? 'writing-mode__active' : ''}
              onClick={() => setShowPreview(true)}
              type="button"
            >
              <Eye aria-hidden="true" size={16} />
              Preview
            </button>
          </div>

          {showPreview ? (
            <article aria-label="Story preview" className="writing-preview">
              <div className="writing-preview__cover">
                <WritingCover key={coverUrl || 'no-cover'} title={fields.title} url={coverUrl} />
              </div>
              {selectedCategoryIds.length > 0 && (
                <div className="writing-preview__categories">
                  {selectedCategoryIds.map((categoryId) => (
                    <span className="writing-preview__category" key={categoryId}>
                      {categoryChoices.find((category) => category.id === categoryId)?.name ||
                        'Unavailable category'}
                    </span>
                  ))}
                </div>
              )}
              <h2>{fields.title || 'Untitled story'}</h2>
              {fields.excerpt && <p className="writing-preview__excerpt">{fields.excerpt}</p>}
              <div className="writing-preview__meta">
                {user.user_metadata?.full_name || 'Your name'}
                {story?.published_at && ` · ${formatDate(story.published_at)}`}
                {` · ${Math.max(1, Math.ceil(wordTotal / 220))} min read`}
              </div>
              {fields.content ? (
                <div className="writing-preview__content">{fields.content}</div>
              ) : (
                <p className="writing-preview__empty">Your story text will appear here.</p>
              )}
              {selectedTagIds.length > 0 && (
                <ul aria-label="Selected story tags" className="writing-preview__tags">
                  {tags
                    .filter((tag) => selectedTagIds.includes(tag.id))
                    .map((tag) => (
                      <li key={tag.id}>#{tag.name}</li>
                    ))}
                </ul>
              )}
            </article>
          ) : (
            <form
              className="writing-editor"
              onSubmit={(event) => event.preventDefault()}
            >
              <fieldset className="writing-editor__fieldset" disabled={isSaving}>
                <div className="writing-editor__fields">
                <div className="form-field">
                  <label htmlFor="story-title">Story title</label>
                  <input
                    autoComplete="off"
                    id="story-title"
                    maxLength={160}
                    onChange={(event) => updateField('title', event.target.value)}
                    placeholder="Give your story a name"
                    value={fields.title}
                  />
                  <span className="form-field__hint">{fields.title.length}/160</span>
                </div>

                <div className="form-field">
                  <label htmlFor="story-excerpt">Short description</label>
                  <textarea
                    id="story-excerpt"
                    maxLength={500}
                    onChange={(event) => updateField('excerpt', event.target.value)}
                    placeholder="A few inviting lines to help readers find your story"
                    rows={3}
                    value={fields.excerpt}
                  />
                  <span className="form-field__hint">{fields.excerpt.length}/500</span>
                </div>

                <fieldset className="writing-tags writing-categories">
                  <legend>Categories</legend>
                  <p>Select any categories that fit your story.</p>
                  <div className="writing-tags__list">
                    {categoryChoices.map((category) => (
                      <label
                        className={`writing-tag${selectedCategoryIds.includes(category.id) ? ' writing-tag--selected' : ''}`}
                        key={category.id}
                      >
                        <input
                          checked={selectedCategoryIds.includes(category.id)}
                          onChange={() => toggleCategory(category.id)}
                          type="checkbox"
                        />
                        {category.name}
                        {!category.is_active && (
                          <span className="writing-category-inactive">Inactive</span>
                        )}
                      </label>
                    ))}
                  </div>
                </fieldset>

                {tags.length > 0 && (
                  <fieldset className="writing-tags">
                    <legend>Tags</legend>
                    <p>Choose a few words that help readers discover this story.</p>
                    <div className="writing-tags__list">
                      {tags.map((tag) => (
                        <label
                          className={`writing-tag${selectedTagIds.includes(tag.id) ? ' writing-tag--selected' : ''}`}
                          key={tag.id}
                        >
                          <input
                            checked={selectedTagIds.includes(tag.id)}
                            onChange={() => toggleTag(tag.id)}
                            type="checkbox"
                          />
                          {tag.name}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}

                <div className="form-field">
                  <label htmlFor="story-content">Your story</label>
                  <textarea
                    className="writing-editor__content"
                    id="story-content"
                    onChange={(event) => updateField('content', event.target.value)}
                    placeholder="Begin wherever the story begins..."
                    rows={20}
                    value={fields.content}
                  />
                  <span className="form-field__hint">{wordTotal} words</span>
                </div>

                <div className="form-field">
                  <label htmlFor="story-cover">Cover image</label>
                  <input
                    accept="image/avif,image/jpeg,image/png,image/webp"
                    className="visually-hidden"
                    id="story-cover"
                    onChange={handleCoverChange}
                    type="file"
                  />
                  <label className="upload-control" htmlFor="story-cover">
                    <ImagePlus aria-hidden="true" size={17} />
                    <span>
                      {coverFile
                        ? slugFromFileName(coverFile.name)
                        : existingCoverUrl && !removeCover
                          ? 'Replace cover image'
                          : 'Choose a cover image'}
                    </span>
                    <span className="upload-control__hint">Max 5 MB</span>
                  </label>
                  {story?.cover_error && (
                    <span className="form-field__hint" role="status">
                      The saved cover could not be previewed: {story.cover_error}
                    </span>
                  )}
                  {coverUrl && (
                    <div className="writing-cover-preview">
                      <WritingCover
                        compact
                        key={coverUrl}
                        title={fields.title}
                        url={coverUrl}
                      />
                      <button
                        aria-label="Remove cover image"
                        className="writing-cover-preview__remove"
                        onClick={() => {
                          if (coverPreviewRef.current) {
                            URL.revokeObjectURL(coverPreviewRef.current)
                            coverPreviewRef.current = ''
                          }
                          setCoverPreview('')
                          setCoverFile(null)
                          setRemoveCover(true)
                        }}
                        type="button"
                      >
                        <X aria-hidden="true" size={15} />
                        Remove cover
                      </button>
                    </div>
                  )}
                  {!coverUrl && story?.cover_path && !removeCover && (
                    <button
                      className="writing-cover-preview__remove"
                      onClick={() => setRemoveCover(true)}
                      type="button"
                    >
                      <X aria-hidden="true" size={15} />
                      Remove saved cover
                    </button>
                  )}
                  {removeCover && (
                    <p className="form-field__hint">The current cover will be removed when you save.</p>
                  )}
                </div>
                </div>
              </fieldset>
            </form>
          )}
        </div>

        <aside aria-label="Publishing controls" className="writing-sidebar">
          <div className="writing-publish-card">
            <p className="eyebrow">
              <span className="eyebrow__rule" />
              {published ? 'Your published story' : 'Your story, your pace'}
            </p>
            <h2>{published ? 'Ready for another edit?' : 'Save your progress'}</h2>
            <p>
              {published
                ? 'Your published story is visible to the community. Save your changes when you are ready.'
                : 'Drafts are private to you. Publish when the story feels ready to be read.'}
            </p>
            <div className="writing-publish-card__stats">
              <span>{wordTotal} words</span>
              <span>{Math.max(1, Math.ceil(wordTotal / 220))} min read</span>
            </div>
            <button
              className="button button--outline writing-publish-card__button"
              disabled={!canSave}
              onClick={() => handleSave('draft')}
              type="button"
            >
              <Save aria-hidden="true" size={16} />
              {published ? 'Move to draft' : 'Save draft'}
            </button>
            <button
              className="button writing-publish-card__button"
              disabled={!canSave}
              onClick={() => handleSave('published')}
              type="button"
            >
              <Send aria-hidden="true" size={15} />
              {published ? 'Save changes' : 'Publish story'}
            </button>
            {story?.status === 'published' && (
              <Link className="text-link writing-publish-card__view" to={`/story/${story.slug}`}>
                View published story <ArrowUpRight aria-hidden="true" size={15} />
              </Link>
            )}
          </div>

          {saveMessage && (
            <div
              className={`form-message${saveMessage.type === 'error' ? ' form-message--error' : ' form-message--success'}`}
              role={saveMessage.type === 'error' ? 'alert' : 'status'}
            >
              {saveMessage.type === 'success' && <Check aria-hidden="true" size={16} />}
              {saveMessage.text}
            </div>
          )}

          {story && (
            <button
              className="writing-delete"
              disabled={isDeleting || isSaving}
              onClick={handleDelete}
              type="button"
            >
              {isDeleting ? (
                <LoaderCircle aria-hidden="true" className="auth-loading__icon" size={15} />
              ) : (
                <Trash2 aria-hidden="true" size={15} />
              )}
              Delete story
            </button>
          )}
          <Link className="writing-back-link" to={story?.status === 'published' ? `/story/${story.slug}` : '/explore'}>
            <ArrowLeft aria-hidden="true" size={15} />
            {story?.status === 'published' ? 'Back to story' : 'Back to Explore'}
          </Link>
        </aside>
      </div>
    </section>
  )
}

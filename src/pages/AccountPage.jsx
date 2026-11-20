import { useEffect, useRef, useState } from 'react'
import { Camera, Check, LoaderCircle, UserRound } from 'lucide-react'
import { useAuth } from '../auth/useAuth.js'
import { getSupabaseClient } from '../lib/supabase.js'

const MAX_AVATAR_SIZE = 2 * 1024 * 1024
const AVATAR_EXTENSIONS = {
  'image/avif': 'avif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}
const PROFILE_FIELDS = 'id, username, full_name, avatar_path, bio, created_at'
const USERNAME_PATTERN = /^[a-z0-9_]{3,30}$/

function errorText(error) {
  return error instanceof Error ? error.message : 'An unexpected profile error occurred.'
}

function avatarUrl(path) {
  if (!path) {
    return ''
  }
  return getSupabaseClient().storage.from('profile-pictures').getPublicUrl(path).data.publicUrl
}

export function AccountPage() {
  const { user } = useAuth()
  const [profile, setProfile] = useState(null)
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [bio, setBio] = useState('')
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [formError, setFormError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const avatarPreviewRef = useRef('')

  useEffect(() => {
    return () => {
      if (avatarPreviewRef.current) {
        URL.revokeObjectURL(avatarPreviewRef.current)
      }
    }
  }, [])

  useEffect(() => {
    let active = true

    async function loadProfile() {
      setIsLoading(true)
      setLoadError('')
      try {
        const { data, error } = await getSupabaseClient()
          .from('profiles')
          .select(PROFILE_FIELDS)
          .eq('id', user.id)
          .single()

        if (error) {
          throw error
        }
        if (active) {
          setProfile(data)
          setFullName(data.full_name)
          setUsername(data.username)
          setBio(data.bio)
        }
      } catch (error) {
        if (active) {
          setLoadError(errorText(error))
        }
      } finally {
        if (active) {
          setIsLoading(false)
        }
      }
    }

    loadProfile()
    return () => {
      active = false
    }
  }, [user.id])

  function handleAvatarChange(event) {
    setFormError('')
    setSuccessMessage('')
    const file = event.target.files?.[0]
    if (avatarPreviewRef.current) {
      URL.revokeObjectURL(avatarPreviewRef.current)
      avatarPreviewRef.current = ''
    }
    setAvatarPreview('')

    if (!file) {
      setAvatarFile(null)
      return
    }

    if (!AVATAR_EXTENSIONS[file.type]) {
      setAvatarFile(null)
      setFormError('Choose an AVIF, JPEG, PNG, or WebP image.')
      event.target.value = ''
      return
    }
    if (file.size > MAX_AVATAR_SIZE) {
      setAvatarFile(null)
      setFormError('Profile pictures must be 2 MB or smaller.')
      event.target.value = ''
      return
    }

    setAvatarFile(file)
    avatarPreviewRef.current = URL.createObjectURL(file)
    setAvatarPreview(avatarPreviewRef.current)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setFormError('')
    setSuccessMessage('')

    const normalizedUsername = username.trim().toLowerCase()
    const normalizedName = fullName.trim()
    const normalizedBio = bio.trim()

    if (!normalizedName || normalizedName.length > 80) {
      setFormError('Enter your name using 1 to 80 characters.')
      return
    }
    if (!USERNAME_PATTERN.test(normalizedUsername)) {
      setFormError('Your username must be 3–30 lowercase letters, numbers, or underscores.')
      return
    }
    if (normalizedBio.length > 500) {
      setFormError('Your bio must be 500 characters or fewer.')
      return
    }

    setIsSaving(true)
    let uploadedPath = ''
    let profileSaved = false

    try {
      const supabase = getSupabaseClient()
      const { data: existingProfile, error: usernameError } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', normalizedUsername)
        .neq('id', user.id)
        .maybeSingle()

      if (usernameError) {
        throw usernameError
      }
      if (existingProfile) {
        setFormError('That username is already in use.')
        return
      }

      if (avatarFile) {
        const extension = AVATAR_EXTENSIONS[avatarFile.type]
        uploadedPath = `${user.id}/${crypto.randomUUID()}.${extension}`
        const { error: uploadError } = await supabase.storage
          .from('profile-pictures')
          .upload(uploadedPath, avatarFile, {
            cacheControl: '3600',
            contentType: avatarFile.type,
            upsert: false,
          })

        if (uploadError) {
          throw new Error(`Profile picture upload failed: ${uploadError.message}`)
        }
      }

      const updates = {
        full_name: normalizedName,
        username: normalizedUsername,
        bio: normalizedBio,
        avatar_path: uploadedPath || profile.avatar_path,
      }
      const { data, error: updateError } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id)
        .select(PROFILE_FIELDS)
        .single()

      if (updateError) {
        if (uploadedPath) {
          const { error: cleanupError } = await supabase.storage
            .from('profile-pictures')
            .remove([uploadedPath])
          if (cleanupError) {
            throw new Error(
              `Profile update failed: ${updateError.message}. The new image also could not be removed: ${cleanupError.message}`,
            )
          }
        }
        throw updateError
      }

      profileSaved = true
      const previousAvatarPath = profile.avatar_path
      setProfile(data)
      setFullName(data.full_name)
      setUsername(data.username)
      setBio(data.bio)
      setAvatarFile(null)
      if (avatarPreviewRef.current) {
        URL.revokeObjectURL(avatarPreviewRef.current)
        avatarPreviewRef.current = ''
      }
      setAvatarPreview('')
      setSuccessMessage('Your profile has been updated.')

      if (uploadedPath && previousAvatarPath) {
        try {
          const { error: removeError } = await supabase.storage
            .from('profile-pictures')
            .remove([previousAvatarPath])
          if (removeError) {
            setSuccessMessage(
              `Your profile was updated, but the previous picture could not be removed: ${removeError.message}`,
            )
          }
        } catch (error) {
          setSuccessMessage(
            `Your profile was updated, but the previous picture could not be removed: ${errorText(error)}`,
          )
        }
      }
    } catch (error) {
      if (profileSaved) {
        setSuccessMessage(
          `Your profile was updated, but image cleanup failed: ${errorText(error)}`,
        )
      } else {
        setFormError(errorText(error))
      }
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div aria-busy="true" className="auth-loading account-loading">
        <LoaderCircle aria-hidden="true" className="auth-loading__icon" size={24} />
        <span>Loading your profile…</span>
      </div>
    )
  }

  if (loadError || !profile) {
    return (
      <section className="auth-state">
        <p className="eyebrow">
          <span className="eyebrow__rule" />
          Profile unavailable
        </p>
        <h1>We could not load your profile.</h1>
        <p>{loadError || 'Your profile record was not found.'}</p>
      </section>
    )
  }

  const currentAvatar = avatarPreview || avatarUrl(profile.avatar_path)

  return (
    <section className="account-page">
      <div className="account-page__intro">
        <p className="eyebrow">
          <span className="eyebrow__rule" />
          Your space
        </p>
        <h1>Account settings</h1>
        <p>Keep your author profile true to the voice you want to share.</p>
      </div>

      <div className="account-card">
        <div className="account-card__header">
          <div className="avatar-preview">
            {currentAvatar ? (
              <img alt="" src={currentAvatar} />
            ) : (
              <UserRound aria-hidden="true" size={30} />
            )}
          </div>
          <div>
            <h2>{profile.full_name}</h2>
            <p>@{profile.username}</p>
          </div>
        </div>

        <form className="account-form" onSubmit={handleSubmit}>
          <div className="form-field">
            <label htmlFor="profile-picture">Profile picture</label>
            <input
              accept="image/avif,image/jpeg,image/png,image/webp"
              className="visually-hidden"
              id="profile-picture"
              onChange={handleAvatarChange}
              type="file"
            />
            <label className="upload-control" htmlFor="profile-picture">
              <Camera aria-hidden="true" size={17} />
              <span>{avatarFile ? avatarFile.name : 'Choose an image'}</span>
              <span className="upload-control__hint">Max 2 MB</span>
            </label>
          </div>

          <div className="form-field">
            <label htmlFor="profile-name">Full name</label>
            <input
              autoComplete="name"
              id="profile-name"
              maxLength={80}
              onChange={(event) => setFullName(event.target.value)}
              required
              value={fullName}
            />
          </div>

          <div className="form-field">
            <label htmlFor="profile-username">Username</label>
            <input
              autoComplete="username"
              id="profile-username"
              maxLength={30}
              minLength={3}
              onChange={(event) =>
                setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
              }
              pattern="[a-z0-9_]{3,30}"
              required
              value={username}
            />
          </div>

          <div className="form-field">
            <label htmlFor="profile-bio">Bio</label>
            <textarea
              id="profile-bio"
              maxLength={500}
              onChange={(event) => setBio(event.target.value)}
              rows={4}
              value={bio}
            />
            <span className="form-field__hint">{bio.length}/500 characters</span>
          </div>

          <div className="account-form__private">
            <span>Email address</span>
            <span>{user.email}</span>
            <small>Your email is private and is not shown on your public profile.</small>
          </div>

          {formError && (
            <div className="form-message form-message--error" role="alert">
              {formError}
            </div>
          )}
          {successMessage && (
            <div className="form-message form-message--success" role="status">
              <Check aria-hidden="true" size={16} />
              {successMessage}
            </div>
          )}

          <button className="button" disabled={isSaving} type="submit">
            {isSaving ? 'Saving changes…' : 'Save profile'}
          </button>
        </form>
      </div>
    </section>
  )
}

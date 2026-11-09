'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { getUiTranslation } from '@/lib/translations';
import ShareButton from './ShareButton';

export default function ProfilePanel({
  isOpen,
  onClose,
  selectedLanguage = 'en',
  onSelectArticle,
  onUnsaveArticle,
}) {
  const { data: session, status } = useSession();
  const [profileData, setProfileData] = useState(null);
  const [savedArticles, setSavedArticles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [removingId, setRemovingId] = useState(null);

  const fetchProfileAndSaved = useCallback(async () => {
    if (status !== 'authenticated') return;
    setIsLoading(true);
    setError(null);

    try {
      const [profileRes, savedRes] = await Promise.all([
        fetch('/api/user/profile'),
        fetch('/api/user/saved?limit=100'),
      ]);

      if (!profileRes.ok || !savedRes.ok) {
        throw new Error('Failed to fetch user data');
      }

      const pData = await profileRes.json();
      const sData = await savedRes.json();

      setProfileData(pData);
      setSavedArticles(sData.articles || []);
    } catch (err) {
      console.error('[ProfilePanel] Error loading profile details:', err);
      setError('Failed to load profile details. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [status]);

  useEffect(() => {
    if (isOpen) {
      fetchProfileAndSaved();
    }
  }, [isOpen, fetchProfileAndSaved]);

  // Handle ESC key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleRemoveSaved = async (e, stableId) => {
    e.stopPropagation();
    if (!stableId || removingId) return;

    setRemovingId(stableId);
    try {
      const res = await fetch(`/api/user/saved/${stableId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setSavedArticles((prev) => prev.filter((a) => a.stableId !== stableId));
        setProfileData((prev) =>
          prev ? { ...prev, savedCount: Math.max(0, (prev.savedCount || 1) - 1) } : prev
        );
        if (onUnsaveArticle) {
          onUnsaveArticle(stableId);
        }
      } else {
        alert('Failed to remove saved article. Please try again.');
      }
    } catch (err) {
      console.error('[ProfilePanel] Error removing saved article:', err);
      alert('Network error while removing article.');
    } finally {
      setRemovingId(null);
    }
  };

  const handleArticleClick = (article) => {
    if (onSelectArticle) {
      // Adapt saved article format to match reader modal expectations
      onSelectArticle({
        id: article.stableId,
        stableId: article.stableId,
        title: article.title,
        link: article.link,
        source: article.source,
        imageUrl: article.imageUrl,
        summary: article.summary,
        category: article.category,
        pubDate: article.pubDate,
      });
      onClose();
    }
  };

  if (!isOpen) return null;

  const memberSince = profileData?.createdAt
    ? new Date(profileData.createdAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : '';

  return (
    <div
      className="profile-panel-overlay modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-panel-title"
    >
      <aside
        className="profile-panel"
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
      >
        <div className="profile-panel-header">
          <div className="profile-panel-header-title">
            <span className="profile-panel-icon" aria-hidden="true">👤</span>
            <h2 id="profile-panel-title" className="profile-panel-heading">My Account</h2>
          </div>
          <button
            type="button"
            className="profile-panel-close-btn"
            onClick={onClose}
            aria-label="Close profile panel"
          >
            ✕
          </button>
        </div>

        <div className="profile-panel-body">
          {isLoading ? (
            <div className="profile-panel-loading">
              <div className="profile-panel-skeleton-header"></div>
              <div className="profile-panel-skeleton-streak"></div>
              <div className="profile-panel-skeleton-list">
                <div className="profile-skeleton-item"></div>
                <div className="profile-skeleton-item"></div>
                <div className="profile-skeleton-item"></div>
              </div>
            </div>
          ) : error ? (
            <div className="profile-panel-error">
              <p>{error}</p>
              <button
                type="button"
                className="profile-retry-btn"
                onClick={fetchProfileAndSaved}
              >
                Retry
              </button>
            </div>
          ) : (
            <>
              {/* User Account Info Card */}
              <section className="profile-user-card">
                <div className="profile-avatar-circle">
                  {(session?.user?.email?.[0] || 'U').toUpperCase()}
                </div>
                <div className="profile-user-details">
                  <div className="profile-user-email">{session?.user?.email}</div>
                  {memberSince && (
                    <div className="profile-user-member-since">
                      Member since {memberSince}
                    </div>
                  )}
                </div>
              </section>

              {/* Login Streak Banner */}
              <section className="profile-streak-card">
                <div className="profile-streak-header">
                  <span className="profile-streak-flame" aria-hidden="true">🔥</span>
                  <div className="profile-streak-title">Login Streak</div>
                </div>
                <div className="profile-streak-stats">
                  <div className="profile-streak-stat-item">
                    <span className="profile-streak-stat-val">
                      {profileData?.currentStreak || 0}
                    </span>
                    <span className="profile-streak-stat-lbl">Day Current</span>
                  </div>
                  <div className="profile-streak-stat-divider">•</div>
                  <div className="profile-streak-stat-item">
                    <span className="profile-streak-stat-val">
                      {profileData?.longestStreak || 0}
                    </span>
                    <span className="profile-streak-stat-lbl">Day Best</span>
                  </div>
                </div>
                {profileData?.lastLoginDate && (
                  <div className="profile-streak-footer">
                    Last active: {profileData.lastLoginDate} (IST)
                  </div>
                )}
              </section>

              {/* Saved Articles Section */}
              <section className="profile-saved-section">
                <div className="profile-saved-header">
                  <div className="profile-saved-title-group">
                    <span aria-hidden="true">🔖</span>
                    <h3 className="profile-saved-title">Saved Articles</h3>
                  </div>
                  <span className="profile-saved-count-badge">
                    {savedArticles.length} / 500
                  </span>
                </div>

                {savedArticles.length === 0 ? (
                  <div className="profile-saved-empty">
                    <div className="profile-empty-icon" aria-hidden="true">📖</div>
                    <p className="profile-empty-text">
                      No saved articles yet. Bookmark articles from the news feed to read them later.
                    </p>
                  </div>
                ) : (
                  <ul className="profile-saved-list">
                    {savedArticles.map((art) => (
                      <li
                        key={art.stableId}
                        className="profile-saved-item"
                        onClick={() => handleArticleClick(art)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleArticleClick(art);
                          }
                        }}
                      >
                        {art.imageUrl && (
                          <div className="profile-saved-thumb-wrap">
                            <img
                              src={art.imageUrl}
                              alt=""
                              className="profile-saved-thumb"
                              loading="lazy"
                              onError={(e) => {
                                e.target.style.display = 'none';
                              }}
                            />
                          </div>
                        )}
                        <div className="profile-saved-info">
                          <h4 className="profile-saved-item-title">{art.title}</h4>
                          <div className="profile-saved-item-meta">
                            {art.source && (
                              <span className="profile-saved-item-source">{art.source}</span>
                            )}
                            {art.category && (
                              <span className="profile-saved-item-cat">{art.category}</span>
                            )}
                          </div>
                        </div>
                        <ShareButton
                          variant="saved"
                          url={art.link}
                          title={art.title}
                          text={art.summary}
                          articleTitle={art.title}
                        />
                        <button
                          type="button"
                          className="profile-saved-remove-btn"
                          onClick={(e) => handleRemoveSaved(e, art.stableId)}
                          disabled={removingId === art.stableId}
                          title="Remove from saved articles"
                          aria-label={`Remove saved article: ${art.title}`}
                        >
                          {removingId === art.stableId ? '...' : '🗑️'}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>

        <div className="profile-panel-footer">
          <button
            type="button"
            className="profile-signout-btn"
            onClick={() => {
              signOut({ redirect: false });
              onClose();
            }}
          >
            Sign Out
          </button>
        </div>
      </aside>
    </div>
  );
}

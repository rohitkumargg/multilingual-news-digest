'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatLocalizedRelativeDate, getUiTranslation, UI_TRANSLATIONS } from '@/lib/translations';
import { isPlaceholderOrCorruptedImage } from '@/lib/constants';
import { playSpeech, stopSpeech } from '@/lib/speaker';

// Module-level client cache for on-demand fullStory translations across modal sessions
const fullStoryCache = new Map();

export default function ArticleReaderModal({
  article,
  selectedLanguage = 'en',
  onClose,
  onNavigate,
  hasPrev = false,
  hasNext = false,
}) {
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const [translatedStoryText, setTranslatedStoryText] = useState(null);
  const [isLoadingStory, setIsLoadingStory] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [article?.link, article?.title]);

  // Stop any active speech
  const stopAudio = useCallback(() => {
    stopSpeech();
    setIsPlayingAudio(false);
  }, []);

  // Keyboard navigation & escape listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        stopAudio();
        onClose();
      } else if (e.key === 'ArrowLeft' && hasPrev && onNavigate) {
        stopAudio();
        onNavigate('prev');
      } else if (e.key === 'ArrowRight' && hasNext && onNavigate) {
        stopAudio();
        onNavigate('next');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    // Lock body scroll
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
      stopAudio();
    };
  }, [onClose, onNavigate, hasPrev, hasNext, stopAudio]);

  // On-demand fullStory translation when modal opens in a non-English language
  const articleKey = article?.id || article?.link || article?.title;
  const cacheKey = articleKey && selectedLanguage !== 'en' ? `${articleKey}_${selectedLanguage}` : null;

  useEffect(() => {
    // If English, no translation needed
    if (!article || selectedLanguage === 'en') {
      setTranslatedStoryText(null);
      setIsLoadingStory(false);
      return;
    }

    const storyToTranslate = article.fullStory || article.summary || article.snippet;
    if (!storyToTranslate || typeof storyToTranslate !== 'string' || !storyToTranslate.trim()) {
      setTranslatedStoryText(null);
      setIsLoadingStory(false);
      return;
    }

    // Check client-side cache
    if (cacheKey && fullStoryCache.has(cacheKey)) {
      setTranslatedStoryText(fullStoryCache.get(cacheKey));
      setIsLoadingStory(false);
      return;
    }

    let isCancelled = false;
    setIsLoadingStory(true);

    async function fetchFullStory() {
      try {
        const res = await fetch('/api/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: storyToTranslate,
            targetLanguage: selectedLanguage,
          }),
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        const translated = data?.translatedText;

        if (!isCancelled) {
          if (translated && typeof translated === 'string' && translated.trim().length > 0) {
            if (cacheKey) {
              fullStoryCache.set(cacheKey, translated);
            }
            setTranslatedStoryText(translated);
          } else {
            setTranslatedStoryText(storyToTranslate);
          }
        }
      } catch (err) {
        console.warn('[ArticleReader] Failed to translate full story on-demand:', err);
        if (!isCancelled) {
          setTranslatedStoryText(storyToTranslate);
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingStory(false);
        }
      }
    }

    fetchFullStory();

    return () => {
      isCancelled = true;
    };
  }, [article?.id, article?.link, article?.title, article?.fullStory, article?.summary, article?.snippet, selectedLanguage, cacheKey]);

  if (!article) return null;

  const { title, imageUrl, summary, snippet, fullStory, highlights, source, pubDate, category } = article;

  const relativeDate = formatLocalizedRelativeDate(pubDate, selectedLanguage);
  const unknownSourceText = getUiTranslation(selectedLanguage, 'unknownSource');
  const sourceName = source || unknownSourceText;

  const categoryLabel = category
    ? UI_TRANSLATIONS[selectedLanguage]?.categories[category] || UI_TRANSLATIONS.en.categories[category]
    : null;

  const keyHighlightsLabel = getUiTranslation(selectedLanguage, 'keyHighlights') || 'Key Highlights';
  const fullStoryLabel = getUiTranslation(selectedLanguage, 'fullStory') || 'Full Story & Context';
  const closeLabel = getUiTranslation(selectedLanguage, 'closeReader') || 'Close';
  const prevLabel = getUiTranslation(selectedLanguage, 'previousStory') || '← Previous';
  const nextLabel = getUiTranslation(selectedLanguage, 'nextStory') || 'Next →';
  const listenLabel = getUiTranslation(selectedLanguage, 'listenSummary') || 'Listen';
  const stopAudioLabel = getUiTranslation(selectedLanguage, 'stopAudio') || 'Stop';
  const copyLabel = getUiTranslation(selectedLanguage, 'copySummary') || 'Copy';
  const copiedLabel = getUiTranslation(selectedLanguage, 'copiedSummary') || 'Copied!';
  const importedFromLabel = getUiTranslation(selectedLanguage, 'importedFrom') || 'Imported from';
  const inWebsiteNotice = getUiTranslation(selectedLanguage, 'inWebsiteNotice') || 'Viewed in MND • No external redirect';

  const activeStory = selectedLanguage === 'en'
    ? (fullStory || summary || snippet || '')
    : (translatedStoryText || fullStory || summary || snippet || '');

  const storyParagraphs = activeStory
    .split('\n\n')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const hasValidImage = Boolean(
    imageUrl &&
    typeof imageUrl === 'string' &&
    !isPlaceholderOrCorruptedImage(imageUrl) &&
    !imgFailed
  );

  const displayHighlights = Array.isArray(highlights) && highlights.length > 0
    ? highlights
    : [summary || snippet];

  const handleToggleAudio = () => {
    if (isPlayingAudio) {
      stopAudio();
    } else {
      const readText = `${title}. ${summary || snippet}`;
      playSpeech({
        text: readText,
        lang: selectedLanguage,
        onStart: () => setIsPlayingAudio(true),
        onEnd: () => setIsPlayingAudio(false),
        onError: () => setIsPlayingAudio(false),
      });
    }
  };

  const handleCopySummary = async () => {
    const textToCopy = `${title}\n\nSummary:\n${summary || snippet}\n\nSource: ${sourceName} (${inWebsiteNotice})`;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2200);
    } catch {
      // Fallback
    }
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      stopAudio();
      onClose();
    }
  };

  return (
    <div
      className="reader-overlay"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="reader-article-title"
    >
      <div className="reader-modal">
        {/* Top Control Bar */}
        <div className="reader-header-bar">
          <div className="reader-meta-chips">
            {categoryLabel && (
              <span className="reader-category-chip">{categoryLabel}</span>
            )}
            <span className="reader-source-chip">
              {importedFromLabel} <strong>{sourceName}</strong>
            </span>
            <span className="reader-date-chip">{relativeDate}</span>
          </div>

          <div className="reader-header-actions">
            <button
              type="button"
              className={`reader-action-btn ${isPlayingAudio ? 'active' : ''}`}
              onClick={handleToggleAudio}
              title={isPlayingAudio ? stopAudioLabel : listenLabel}
              aria-label={isPlayingAudio ? stopAudioLabel : listenLabel}
            >
              {isPlayingAudio ? (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                  <span>{stopAudioLabel}</span>
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                  </svg>
                  <span>{listenLabel}</span>
                </>
              )}
            </button>

            <button
              type="button"
              className="reader-action-btn"
              onClick={handleCopySummary}
              title={copyLabel}
              aria-label={copyLabel}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
              </svg>
              <span>{isCopied ? copiedLabel : copyLabel}</span>
            </button>

            <button
              type="button"
              className="reader-close-btn"
              onClick={() => {
                stopAudio();
                onClose();
              }}
              title={closeLabel}
              aria-label={closeLabel}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>

        {/* Scrollable Reader Content */}
        <div className="reader-body">
          <h1 id="reader-article-title" className="reader-title">
            {title}
          </h1>

          {/* Notice banner confirming inside-site reading */}
          <div className="reader-attribution-banner">
            <span className="reader-banner-icon">⚡</span>
            <span>
              {inWebsiteNotice} • {importedFromLabel} <strong>{sourceName}</strong>
            </span>
          </div>

          {/* Hero Image - rendered only if article has a valid image */}
          {hasValidImage && (
            <div className="reader-image-wrap">
              <img
                src={imageUrl}
                alt={title}
                className="reader-image"
                onError={() => setImgFailed(true)}
                onLoad={(e) => {
                  if (!e.target.naturalWidth || e.target.naturalWidth <= 16 || !e.target.naturalHeight || e.target.naturalHeight <= 16) {
                    setImgFailed(true);
                  }
                }}
              />
            </div>
          )}

          {/* Key Highlights Section */}
          <section className="reader-section reader-highlights-card">
            <div className="reader-section-header">
              <span className="reader-sparkle-icon">✨</span>
              <h2 className="reader-section-title">{keyHighlightsLabel}</h2>
            </div>
            <ul className="reader-highlights-list">
              {displayHighlights.map((point, index) => (
                <li key={index} className="reader-highlight-item">
                  <span className="reader-highlight-bullet">▸</span>
                  <span className="reader-highlight-text">{point}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Full Story / In-depth Context Section */}
          <section className="reader-section reader-story-section">
            <div className="reader-section-header">
              <span className="reader-story-icon">📰</span>
              <h2 className="reader-section-title">{fullStoryLabel}</h2>
              {isLoadingStory && (
                <span className="translating-indicator" style={{ marginLeft: '0.6rem' }} aria-label="Translating story">
                  <span className="translating-spinner"></span>
                </span>
              )}
            </div>
            <div className="reader-story-paragraphs">
              {isLoadingStory ? (
                <div className="reader-story-loading" aria-live="polite" style={{ padding: '0.5rem 0' }}>
                  <div style={{ background: 'var(--border-subtle, #e2e8f0)', borderRadius: '4px', height: '14px', width: '100%', marginBottom: '12px', opacity: 0.7 }} />
                  <div style={{ background: 'var(--border-subtle, #e2e8f0)', borderRadius: '4px', height: '14px', width: '94%', marginBottom: '12px', opacity: 0.7 }} />
                  <div style={{ background: 'var(--border-subtle, #e2e8f0)', borderRadius: '4px', height: '14px', width: '97%', marginBottom: '20px', opacity: 0.7 }} />
                  <div style={{ background: 'var(--border-subtle, #e2e8f0)', borderRadius: '4px', height: '14px', width: '90%', marginBottom: '12px', opacity: 0.7 }} />
                  <div style={{ background: 'var(--border-subtle, #e2e8f0)', borderRadius: '4px', height: '14px', width: '93%', marginBottom: '12px', opacity: 0.7 }} />
                  <div style={{ background: 'var(--border-subtle, #e2e8f0)', borderRadius: '4px', height: '14px', width: '68%', opacity: 0.7 }} />
                </div>
              ) : (
                storyParagraphs.map((paragraph, index) => (
                  <p key={index} className="reader-story-p">
                    {paragraph}
                  </p>
                ))
              )}
            </div>
          </section>
        </div>

        {/* Bottom Navigation & Close Bar */}
        <div className="reader-footer-bar">
          <div className="reader-nav-controls">
            <button
              type="button"
              className="reader-nav-btn"
              disabled={!hasPrev}
              onClick={() => {
                stopAudio();
                onNavigate && onNavigate('prev');
              }}
            >
              {prevLabel}
            </button>
            <button
              type="button"
              className="reader-nav-btn"
              disabled={!hasNext}
              onClick={() => {
                stopAudio();
                onNavigate && onNavigate('next');
              }}
            >
              {nextLabel}
            </button>
          </div>

          <button
            type="button"
            className="reader-done-btn"
            onClick={() => {
              stopAudio();
              onClose();
            }}
          >
            {closeLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

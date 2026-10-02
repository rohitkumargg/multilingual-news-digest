'use client';

import { useState, useEffect } from 'react';
import { formatLocalizedRelativeDate, getUiTranslation, UI_TRANSLATIONS } from '@/lib/translations';
import { isPlaceholderOrCorruptedImage } from '@/lib/constants';
import { playSpeech, stopSpeech } from '@/lib/speaker';

export default function NewsCard({
  article,
  selectedLanguage = 'en',
  onSelectArticle,
  isLead = false,
}) {
  const { title, imageUrl, summary, snippet, highlights, source, pubDate, category } = article;
  const [isPlaying, setIsPlaying] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [imageUrl, article?.link]);

  const hasValidImage = Boolean(
    imageUrl &&
    typeof imageUrl === 'string' &&
    !isPlaceholderOrCorruptedImage(imageUrl) &&
    !imgFailed
  );

  const displaySummary = summary || snippet;
  const readMinutes = Math.max(1, Math.ceil((displaySummary?.length || 120) / 350));
  const formattedExactDate = pubDate ? new Date(pubDate).toLocaleString() : '';

  const relativeDate = formatLocalizedRelativeDate(pubDate, selectedLanguage);
  const summaryBadgeText = getUiTranslation(selectedLanguage, 'summaryBadge') || 'Summary';
  const unknownSourceText = getUiTranslation(selectedLanguage, 'unknownSource') || 'News';
  const listenText = getUiTranslation(selectedLanguage, 'listenSummary') || 'Listen';
  const stopText = getUiTranslation(selectedLanguage, 'stopAudio') || 'Stop';
  const readStoryText = getUiTranslation(selectedLanguage, 'readStory') || 'Read Story →';
  const leadBadgeText = getUiTranslation(selectedLanguage, 'leadStory') || 'Lead Story';
  const readTimeText = getUiTranslation(selectedLanguage, 'readTime', { n: readMinutes }) || `${readMinutes}m read`;
  const estimatedReadingTimeText = getUiTranslation(selectedLanguage, 'estimatedReadingTime') || 'Estimated reading time';

  const categoryLabel = category
    ? UI_TRANSLATIONS[selectedLanguage]?.categories?.[category] ||
      UI_TRANSLATIONS.en?.categories?.[category] ||
      category
    : null;

  // Google Translate Text-to-speech audio reader directly on the card
  const handleToggleAudio = (e) => {
    e.stopPropagation();

    if (isPlaying) {
      stopSpeech();
      setIsPlaying(false);
    } else {
      const readText = `${title}. ${displaySummary}`;
      playSpeech({
        text: readText,
        lang: selectedLanguage,
        onStart: () => setIsPlaying(true),
        onEnd: () => setIsPlaying(false),
        onError: () => setIsPlaying(false),
      });
    }
  };

  const handleCardClick = () => {
    if (onSelectArticle) {
      onSelectArticle(article);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleCardClick();
    }
  };

  return (
    <article
      className={`news-card ${isLead ? 'news-card-lead' : ''} ${hasValidImage ? 'news-card-has-image' : 'news-card-no-image'} news-card-cat-${category || 'general'}`}
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`Read article: ${title}`}
    >
      {hasValidImage && (
        <div className="news-card-image-wrap">
          <img
            src={imageUrl}
            alt={title}
            className="news-card-image"
            onError={() => setImgFailed(true)}
            onLoad={(e) => {
              if (!e.target.naturalWidth || e.target.naturalWidth <= 16 || !e.target.naturalHeight || e.target.naturalHeight <= 16) {
                setImgFailed(true);
              }
            }}
            loading="lazy"
          />
          <div className="news-card-badges">
            <div className="news-card-badges-left">
              {isLead && (
                <span className="news-card-lead-pill">
                  ⭐ {leadBadgeText}
                </span>
              )}
              {categoryLabel && (
                <span className={`news-card-category-badge category-badge-${category || 'general'}`}>
                  {categoryLabel}
                </span>
              )}
            </div>
            <span className="news-card-summary-pill">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
              </svg>
              {summaryBadgeText}
            </span>
          </div>
        </div>
      )}

      <div className="news-card-body">
        {/* If article has no image, render badges elegantly at top of body */}
        {!hasValidImage && (
          <div className="news-card-top-badges">
            <div className="news-card-badges-left">
              {isLead && (
                <span className="news-card-lead-pill">
                  ⭐ {leadBadgeText}
                </span>
              )}
              {categoryLabel && (
                <span className={`news-card-category-badge category-badge-${category || 'general'}`}>
                  {categoryLabel}
                </span>
              )}
            </div>
            <span className="news-card-summary-pill news-card-summary-pill-outline">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
              </svg>
              {summaryBadgeText}
            </span>
          </div>
        )}

        <div className="news-card-meta-top">
          <span className="news-card-source-badge">{source || unknownSourceText}</span>
          <span className="news-card-date" title={formattedExactDate}>
            <span aria-hidden="true">⏱️</span> {relativeDate}
          </span>
          <span className="news-card-read-time" title={estimatedReadingTimeText}>
            📖 {readTimeText}
          </span>
        </div>

        <h3 className="news-card-title">{title}</h3>

        {/* Summarized news displayed directly on the card */}
        <div className="news-card-summary-box">
          <p className="news-card-summary-text">{displaySummary}</p>

          {highlights && Array.isArray(highlights) && highlights.length > 1 && (
            <div className="news-card-highlights">
              {highlights.slice(1, isLead ? 4 : 3).map((h, i) => (
                <div key={i} className="news-card-highlight-item">
                  <span className="highlight-bullet">▸</span>
                  <span className="highlight-text">{h}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="news-card-footer">
          <button
            type="button"
            className="news-card-readmore-btn"
            onClick={(e) => {
              e.stopPropagation();
              handleCardClick();
            }}
          >
            <span>{readStoryText}</span>
            <span aria-hidden="true">→</span>
          </button>

          <button
            type="button"
            className={`news-card-audio-btn ${isPlaying ? 'playing' : ''}`}
            onClick={handleToggleAudio}
            title={isPlaying ? stopText : listenText}
            aria-label={isPlaying ? stopText : listenText}
          >
            {isPlaying ? (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
                <span>{stopText}</span>
              </>
            ) : (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
                </svg>
                <span>{listenText}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </article>
  );
}

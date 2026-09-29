'use client';

import { useState } from 'react';
import { formatLocalizedRelativeDate, getUiTranslation, UI_TRANSLATIONS } from '@/lib/translations';

export default function NewsCard({ article, selectedLanguage = 'en' }) {
  const { title, imageUrl, summary, snippet, highlights, source, pubDate, category } = article;
  const [isPlaying, setIsPlaying] = useState(false);

  // Directly display the full summarized news on the card
  const displaySummary = summary || snippet;

  const handleImageError = (e) => {
    e.target.src = '/fallback-news.svg';
  };

  const relativeDate = formatLocalizedRelativeDate(pubDate, selectedLanguage);
  const summaryBadgeText = getUiTranslation(selectedLanguage, 'summaryBadge') || 'Summary';
  const unknownSourceText = getUiTranslation(selectedLanguage, 'unknownSource') || 'News';
  const listenText = getUiTranslation(selectedLanguage, 'listenSummary') || 'Listen';
  const stopText = getUiTranslation(selectedLanguage, 'stopAudio') || 'Stop';

  const categoryLabel = category
    ? UI_TRANSLATIONS[selectedLanguage]?.categories[category] || UI_TRANSLATIONS.en.categories[category]
    : null;

  // Text-to-speech audio reader directly on the card
  const handleToggleAudio = (e) => {
    e.stopPropagation();
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    if (isPlaying) {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
    } else {
      window.speechSynthesis.cancel();
      const readText = `${title}. ${displaySummary}`;
      const utterance = new SpeechSynthesisUtterance(readText);

      const langVoiceMap = {
        en: 'en-IN',
        hi: 'hi-IN',
        te: 'te-IN',
        ta: 'ta-IN',
        bn: 'bn-IN',
        mr: 'mr-IN',
        gu: 'gu-IN',
        kn: 'kn-IN',
        ml: 'ml-IN',
        pa: 'pa-IN',
      };
      utterance.lang = langVoiceMap[selectedLanguage] || 'en-IN';
      utterance.rate = 0.95;

      utterance.onend = () => setIsPlaying(false);
      utterance.onerror = () => setIsPlaying(false);

      window.speechSynthesis.speak(utterance);
      setIsPlaying(true);
    }
  };

  return (
    <article className="news-card">
      <div className="news-card-image-wrap">
        <img
          src={imageUrl || '/fallback-news.svg'}
          alt={title}
          className="news-card-image"
          onError={handleImageError}
          loading="lazy"
        />
        <div className="news-card-badges">
          {categoryLabel && (
            <span className="news-card-category-badge">{categoryLabel}</span>
          )}
          <span className="news-card-summary-pill">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
            </svg>
            {summaryBadgeText}
          </span>
        </div>
      </div>

      <div className="news-card-body">
        <h3 className="news-card-title">{title}</h3>

        {/* Summarized news displayed directly on the card */}
        <div className="news-card-summary-box">
          <p className="news-card-summary-text">{displaySummary}</p>

          {highlights && Array.isArray(highlights) && highlights.length > 1 && (
            <div className="news-card-highlights">
              {highlights.slice(1, 3).map((h, i) => (
                <div key={i} className="news-card-highlight-item">
                  <span className="highlight-bullet">▸</span>
                  <span className="highlight-text">{h}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="news-card-footer">
          <div className="news-card-meta">
            <span className="news-card-source-badge">{source || unknownSourceText}</span>
            <span className="news-card-date">{relativeDate}</span>
          </div>

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

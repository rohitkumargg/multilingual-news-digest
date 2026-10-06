'use client';

import { useState, useEffect } from 'react';
import { getUiTranslation } from '@/lib/translations';

export default function NewsTicker({ articles = [], onSelectArticle, selectedLanguage = 'en' }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const tickerBadge = getUiTranslation(selectedLanguage, 'trendingNews') || 'Latest Updates';
  const tickerAriaText = getUiTranslation(selectedLanguage, 'tickerAria') || 'Breaking and Latest News Ticker';
  const prevHeadlineText = getUiTranslation(selectedLanguage, 'prevHeadline') || 'Previous headline';
  const nextHeadlineText = getUiTranslation(selectedLanguage, 'nextHeadline') || 'Next headline';
  const defaultSourceText = getUiTranslation(selectedLanguage, 'unknownSource') || 'News';

  useEffect(() => {
    if (articles.length <= 1 || isPaused) return;

    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % articles.length);
    }, 4500);

    return () => clearInterval(timer);
  }, [articles.length, isPaused]);

  if (!articles || articles.length === 0) return null;

  const currentArticle = articles[currentIndex];
  if (!currentArticle) return null;

  const handlePrev = (e) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev - 1 + articles.length) % articles.length);
  };

  const handleNext = (e) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev + 1) % articles.length);
  };

  return (
    <div
      className="news-ticker-container"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      role="region"
      aria-label={tickerAriaText}
    >
      <div className="news-ticker-inner">
        <div className="news-ticker-label">
          <span className="ticker-live-dot" aria-hidden="true"></span>
          <span className="ticker-label-text">{tickerBadge}</span>
        </div>

        <button
          type="button"
          className="news-ticker-headline-btn"
          onClick={() => onSelectArticle && onSelectArticle(currentArticle)}
          title={currentArticle.title}
        >
          <span className="ticker-source-tag">{currentArticle.source || defaultSourceText}</span>
          <span className="ticker-headline-text">{currentArticle.title}</span>
        </button>

        <div className="news-ticker-controls">
          <span className="ticker-counter">
            {currentIndex + 1} / {articles.length}
          </span>
          <button
            type="button"
            className="ticker-nav-btn"
            onClick={handlePrev}
            aria-label={prevHeadlineText}
          >
            ‹
          </button>
          <button
            type="button"
            className="ticker-nav-btn"
            onClick={handleNext}
            aria-label={nextHeadlineText}
          >
            ›
          </button>
        </div>
      </div>
    </div>
  );
}

'use client';

/**
 * NewsTicker — CSS marquee, scrolls right→left automatically.
 * Each headline is a real <a> hyperlink opening the source URL.
 * Hover to pause.
 */

import { getUiTranslation } from '@/lib/translations';

export default function NewsTicker({ articles = [], selectedLanguage = 'en' }) {
  if (!articles || articles.length === 0) return null;

  const tickerBadge = getUiTranslation(selectedLanguage, 'trendingNews') || 'Latest';
  const tickerAriaText = getUiTranslation(selectedLanguage, 'tickerAria') || 'Latest news ticker';
  const defaultSourceText = getUiTranslation(selectedLanguage, 'unknownSource') || 'News';

  // Cap at 20 items; duplicate for seamless loop
  const items = articles.slice(0, 20);

  return (
    <div
      className="news-ticker-container"
      role="region"
      aria-label={tickerAriaText}
    >
      <div className="news-ticker-inner">
        <span className="news-ticker-label" aria-hidden="true">
          <span className="ticker-live-dot" />
          {tickerBadge}
        </span>

        {/* Marquee track — overflow hidden wrapper */}
        <div className="ticker-track-wrapper">
          <div className="ticker-track">
            {/* Render twice for seamless infinite loop */}
            {[...items, ...items].map((article, i) => (
              <a
                key={i}
                href={article.link || '#'}
                target={article.link ? '_blank' : undefined}
                rel="noopener noreferrer"
                className="ticker-item"
                aria-label={article.title}
              >
                <span className="ticker-source-tag">
                  {article.source || defaultSourceText}
                </span>
                <span className="ticker-headline-text">{article.title}</span>
                <span className="ticker-sep" aria-hidden="true">·</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

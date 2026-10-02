'use client';

import { useMemo } from 'react';
import StateSelector from './StateSelector';
import LanguageSelector from './LanguageSelector';
import { getUiTranslation } from '@/lib/translations';

export default function Header({
  selectedState,
  onStateChange,
  selectedLanguage = 'en',
  onLanguageChange,
}) {
  const tagline = getUiTranslation(selectedLanguage, 'appTagline') || 'Multilingual News Digest';
  const editionText = getUiTranslation(selectedLanguage, 'edition') || 'India Edition';
  const liveNewsFeedText = getUiTranslation(selectedLanguage, 'liveNewsFeed') || 'LIVE NEWS FEED';
  const dailyDigestText = getUiTranslation(selectedLanguage, 'dailyDigest') || 'DAILY DIGEST';

  // Formatted date line
  const formattedDate = useMemo(() => {
    try {
      const today = new Date();
      const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
      const locale = selectedLanguage === 'en' ? 'en-IN' : `${selectedLanguage}-IN`;
      return today.toLocaleDateString(locale, options);
    } catch {
      return new Date().toDateString();
    }
  }, [selectedLanguage]);

  return (
    <header className="site-header">
      {/* Newspaper Top Dateline Bar */}
      <div className="top-dateline-bar">
        <div className="top-dateline-inner">
          <div className="dateline-left">
            <span className="dateline-date">
              <span className="dateline-icon" aria-hidden="true">📅</span> {formattedDate}
            </span>
            <span className="dateline-divider">•</span>
            <span className="dateline-edition">
              <span className="dateline-icon" aria-hidden="true">🇮🇳</span> {editionText}
            </span>
          </div>

          <div className="dateline-right">
            <span className="live-status-pill">
              <span className="live-dot" aria-hidden="true"></span>
              {liveNewsFeedText}
            </span>
          </div>
        </div>
      </div>

      {/* Main Newspaper Masthead */}
      <div className="masthead-main">
        <div className="masthead-inner">
          <div className="brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <div className="brand-masthead-title">
              <span className="brand-logo-text">MND</span>
              <span className="brand-paper-tag">{dailyDigestText}</span>
            </div>
            <div className="brand-tagline">{tagline}</div>
          </div>

          <div className="header-controls">
            <div className="control-item">
              <StateSelector
                selectedState={selectedState}
                onStateChange={onStateChange}
                selectedLanguage={selectedLanguage}
              />
            </div>
            <div className="control-item">
              <LanguageSelector
                selectedLanguage={selectedLanguage}
                onLanguageChange={onLanguageChange}
              />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

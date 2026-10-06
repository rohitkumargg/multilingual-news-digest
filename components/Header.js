'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import StateSelector from './StateSelector';
import LanguageSelector from './LanguageSelector';
import { getUiTranslation } from '@/lib/translations';

// ── Theme Toggle ──────────────────────────────────────────────────────────────
function useTheme() {
  const [theme, setThemeState] = useState('dark');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('mnd_theme') || 'dark';
      setThemeState(saved);
      document.documentElement.setAttribute('data-theme', saved);
    } catch {}
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('mnd_theme', next); } catch {}
      return next;
    });
  }, []);

  return { theme, toggleTheme };
}

// ── Icons ─────────────────────────────────────────────────────────────────────
function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/>
      <line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/>
      <line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8"/>
      <line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function Header({
  selectedState,
  onStateChange,
  selectedLanguage = 'en',
  onLanguageChange,
  // Date controls
  selectedDate = 'today',
  onSelectDate,
  // Search
  searchQuery = '',
  onSearchChange,
}) {
  const { theme, toggleTheme } = useTheme();
  const [searchOpen, setSearchOpen] = useState(false);

  const tagline = getUiTranslation(selectedLanguage, 'appTagline') || 'Multilingual News Digest';
  const editionText = getUiTranslation(selectedLanguage, 'edition') || 'India Edition';
  const liveNewsFeedText = getUiTranslation(selectedLanguage, 'liveNewsFeed') || 'LIVE';
  const dailyDigestText = getUiTranslation(selectedLanguage, 'dailyDigest') || 'DAILY DIGEST';
  const searchPlaceholder = getUiTranslation(selectedLanguage, 'searchPlaceholder') || 'Search headlines...';
  const clearSearchLabel = getUiTranslation(selectedLanguage, 'clearSearch') || 'Clear';

  const todayYmd = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const datePickerValue = selectedDate !== 'today' ? selectedDate : todayYmd;

  const formattedDate = useMemo(() => {
    try {
      const today = new Date();
      const locale = selectedLanguage === 'en' ? 'en-IN' : `${selectedLanguage}-IN`;
      return today.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return new Date().toDateString();
    }
  }, [selectedLanguage]);

  const handleDateChange = (e) => {
    const val = e.target.value;
    if (!val) return;
    onSelectDate(val === todayYmd ? 'today' : val);
  };

  // Close search on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') { setSearchOpen(false); onSearchChange?.(''); } };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onSearchChange]);

  return (
    <header className="site-header">
      {/* ── Top dateline bar ── */}
      <div className="top-dateline-bar">
        <div className="top-dateline-inner">
          {/* Left: date + live pill */}
          <div className="dateline-left">
            <span className="dateline-date">{formattedDate}</span>
            <span className="dateline-divider" aria-hidden="true">·</span>
            <span className="dateline-edition">{editionText}</span>
            <span className="live-status-pill">
              <span className="live-dot" aria-hidden="true" />
              {liveNewsFeedText}
            </span>
          </div>

          {/* Right: date picker + search + theme toggle */}
          <div className="dateline-right">
            {/* Date picker */}
            <div className="header-date-wrapper" title="Browse archive by date">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <input
                type="date"
                max={todayYmd}
                value={datePickerValue}
                onChange={handleDateChange}
                className="header-date-input"
                aria-label="Select news date"
              />
              {selectedDate !== 'today' && (
                <button
                  type="button"
                  className="header-date-clear"
                  onClick={() => onSelectDate('today')}
                  aria-label="Return to today"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Search */}
            <div className={`header-search-wrapper ${searchOpen || searchQuery ? 'open' : ''}`}>
              <button
                type="button"
                className="header-search-icon-btn"
                onClick={() => setSearchOpen(v => !v)}
                aria-label="Toggle search"
                aria-expanded={searchOpen}
              >
                <SearchIcon />
              </button>
              {(searchOpen || searchQuery) && (
                <input
                  autoFocus
                  type="text"
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="header-search-input"
                  aria-label={searchPlaceholder}
                  onBlur={() => { if (!searchQuery) setSearchOpen(false); }}
                />
              )}
              {searchQuery && (
                <button
                  type="button"
                  className="header-search-clear"
                  onClick={() => { onSearchChange(''); setSearchOpen(false); }}
                  aria-label={clearSearchLabel}
                >
                  ✕
                </button>
              )}
            </div>

            {/* Dark / Light toggle */}
            <button
              type="button"
              className="theme-toggle-btn"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            >
              {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </button>
          </div>
        </div>
      </div>

      {/* ── Masthead ── */}
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

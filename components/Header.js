'use client';

import { useMemo } from 'react';
import { useSession, signOut } from 'next-auth/react';
import StateSelector from './StateSelector';
import LanguageSelector from './LanguageSelector';
import ShareButton from './ShareButton';
import { getUiTranslation } from '@/lib/translations';

export default function Header({
  selectedState,
  onStateChange,
  selectedLanguage = 'en',
  onLanguageChange,
  onAuthClick,
  onProfileClick,
  onFeedbackClick,
}) {
  const { data: session, status } = useSession();
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
            <div className="control-item header-share-control">
              <ShareButton
                variant="masthead"
                url={typeof window !== 'undefined' ? window.location.origin : ''}
                title="MND — Multilingual News Digest"
                text="Stay updated with the latest Indian news. Sports, politics, technology, education and more — in your language."
              />
            </div>
            {onFeedbackClick && (
              <div className="control-item header-feedback-control">
                <button
                  type="button"
                  className="header-feedback-btn"
                  onClick={onFeedbackClick}
                  title="Send Feedback"
                  aria-label="Send Feedback"
                >
                  <span className="header-feedback-icon" aria-hidden="true">✉</span>
                  <span className="header-feedback-text">Feedback</span>
                </button>
              </div>
            )}
            <div className="control-item header-auth-control">
              {status === 'authenticated' ? (
                <div className="header-user-menu">
                  <button
                    type="button"
                    className="header-avatar-btn"
                    onClick={onProfileClick}
                    title={session?.user?.email || 'My Account'}
                    aria-label="Open profile panel"
                  >
                    <span className="avatar-circle">
                      {(session?.user?.email?.[0] || 'U').toUpperCase()}
                    </span>
                    <span className="avatar-email-label">
                      {session?.user?.email?.split('@')[0]}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="header-signout-btn"
                    onClick={() => signOut({ redirect: false })}
                    title="Sign Out"
                    aria-label="Sign Out"
                  >
                    Sign Out
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="header-auth-btn"
                  onClick={onAuthClick}
                  aria-label="Sign In to your account"
                >
                  <span className="auth-btn-icon" aria-hidden="true">👤</span>
                  <span className="auth-btn-text">Sign In</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

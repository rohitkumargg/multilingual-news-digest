'use client';

import { useSession } from 'next-auth/react';
import { getUiTranslation } from '@/lib/translations';

export default function Footer({
  selectedLanguage = 'en',
  onAuthClick,
  onProfileClick,
  onFeedbackClick,
}) {
  const { status } = useSession();
  const copyright = getUiTranslation(selectedLanguage, 'footerCopyright');
  const tagline = getUiTranslation(selectedLanguage, 'footerTagline');

  return (
    <footer className="footer">
      <div className="footer-content">
        <p>{copyright}</p>
        <p>{tagline}</p>
        <div className="footer-links">
          {status === 'authenticated' ? (
            <button
              type="button"
              className="footer-link-btn"
              onClick={onProfileClick}
            >
              My Account
            </button>
          ) : (
            <button
              type="button"
              className="footer-link-btn"
              onClick={onAuthClick}
            >
              Sign In
            </button>
          )}
          {onFeedbackClick && (
            <>
              <span className="footer-divider" aria-hidden="true">•</span>
              <button
                type="button"
                className="footer-link-btn"
                onClick={onFeedbackClick}
              >
                Feedback
              </button>
            </>
          )}
        </div>
      </div>
    </footer>
  );
}

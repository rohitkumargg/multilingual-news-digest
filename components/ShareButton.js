'use client';

import { useState, useEffect, useRef } from 'react';

/**
 * Reusable Share Button (§8, §9, §16, §17)
 *
 * Supports variants:
 * - 'masthead': whole-newspaper share button in Header
 * - 'category': category section share button
 * - 'card': news card share button
 * - 'reader': article reader modal share button
 * - 'saved': profile panel saved article share button
 *
 * Behavior:
 * 1. Attempts navigator.share() (Web Share API) if supported.
 * 2. If user cancels (AbortError), stops silently without error or copying.
 * 3. If navigator.share is unavailable or errors, falls back to clipboard copy.
 * 4. Shows a temporary "Link copied!" toast for 2 seconds upon clipboard copy.
 */
export default function ShareButton({
  url,
  title = 'MND — Multilingual News Digest',
  text,
  variant = 'category',
  categoryLabel,
  articleTitle,
  className = '',
  shareLabel = 'Share',
}) {
  const [copied, setCopied] = useState(false);
  const toastTimerRef = useRef(null);

  // Clean up any pending toast timer on unmount
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const handleShare = async (e) => {
    e.stopPropagation();

    // Determine target URL
    let targetUrl = url;
    if (!targetUrl && typeof window !== 'undefined') {
      targetUrl = window.location.origin;
    }

    const shareData = {
      title: articleTitle || title,
      url: targetUrl,
    };
    if (text) {
      shareData.text = text;
    }

    // 1. Try Web Share API
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share(shareData);
        // User completed OS share sheet — no toast needed
        return;
      } catch (err) {
        if (err?.name === 'AbortError') {
          // User closed share sheet — exit silently
          return;
        }
        console.warn('[ShareButton] Web Share API failed, falling back to clipboard:', err);
      }
    }

    // 2. Clipboard fallback
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(targetUrl);
      } else if (typeof document !== 'undefined') {
        const textarea = document.createElement('textarea');
        textarea.value = targetUrl;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }

      // Reset and restart 2-second toast timer on every successful copy
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
      setCopied(true);
      toastTimerRef.current = setTimeout(() => {
        setCopied(false);
        toastTimerRef.current = null;
      }, 2000);
    } catch (clipErr) {
      console.error('[ShareButton] Failed to copy URL to clipboard:', clipErr);
    }
  };

  const isMasthead = variant === 'masthead';
  const isCard = variant === 'card';
  const isReader = variant === 'reader';
  const isSaved = variant === 'saved';

  let wrapperClass = 'category-share-wrapper';
  let btnClass = 'category-share-btn';
  let ariaLabel = `Share ${categoryLabel || 'category'} section`;
  let buttonTitle = `Share ${categoryLabel || 'category'} section`;

  if (isMasthead) {
    wrapperClass = 'masthead-share-wrapper';
    btnClass = 'masthead-share-btn';
    ariaLabel = 'Share Multilingual News Digest';
    buttonTitle = 'Share newspaper';
  } else if (isCard) {
    wrapperClass = 'card-share-wrapper';
    btnClass = 'news-card-share-btn';
    ariaLabel = `Share article: ${articleTitle || title}`;
    buttonTitle = `Share article: ${articleTitle || title}`;
  } else if (isReader) {
    wrapperClass = 'reader-share-wrapper';
    btnClass = 'reader-action-btn reader-share-btn';
    ariaLabel = `Share article: ${articleTitle || title}`;
    buttonTitle = `Share article: ${articleTitle || title}`;
  } else if (isSaved) {
    wrapperClass = 'profile-saved-share-wrapper';
    btnClass = 'profile-saved-share-btn';
    ariaLabel = `Share article: ${articleTitle || title}`;
    buttonTitle = `Share article: ${articleTitle || title}`;
  }

  return (
    <div className={`share-btn-wrapper ${wrapperClass}`}>
      <button
        type="button"
        className={`share-btn ${btnClass} ${className}`}
        onClick={handleShare}
        aria-label={ariaLabel}
        title={buttonTitle}
      >
        <svg
          className="share-btn-icon"
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
        </svg>
        {isMasthead && <span className="masthead-share-text">Share</span>}
        {isCard && <span className="card-share-text">{shareLabel}</span>}
        {isReader && <span>{shareLabel}</span>}
      </button>

      {copied && (
        <div className="share-toast" role="status" aria-live="polite">
          Link copied!
        </div>
      )}
    </div>
  );
}

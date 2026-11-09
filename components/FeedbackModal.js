'use client';

import { useState, useEffect, useRef } from 'react';

/**
 * FeedbackModal Component (§7, §16, §17)
 *
 * Provides a dialog for submitting feedback with:
 * - Keyboard focus trapping and Escape-to-close accessibility
 * - Live character counter (max 2000 chars, min 10 chars)
 * - Honest dual success states:
 *   - Full success: "Thank you! Your feedback has been received."
 *   - Qualified success (persistence succeeded, email pending/failed):
 *     "Your feedback was received. We'll send ourselves an email notification shortly."
 * - Form retention on error: Preserves message so user never loses their submission.
 */
export default function FeedbackModal({ isOpen, onClose }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('general');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('idle'); // 'idle' | 'loading' | 'success_delivered' | 'success_pending' | 'error'
  const [errorMessage, setErrorMessage] = useState('');

  const modalRef = useRef(null);
  const firstInputRef = useRef(null);
  const triggerElementRef = useRef(null);

  // Focus restoration: capture trigger element when opening, restore when closed
  useEffect(() => {
    if (isOpen) {
      if (typeof document !== 'undefined' && document.activeElement) {
        triggerElementRef.current = document.activeElement;
      }
    } else if (triggerElementRef.current) {
      const el = triggerElementRef.current;
      triggerElementRef.current = null;
      if (el && typeof el.focus === 'function' && document.body.contains(el)) {
        requestAnimationFrame(() => {
          el.focus();
        });
      }
    }
  }, [isOpen]);

  // Safety cleanup on unmount
  useEffect(() => {
    return () => {
      const el = triggerElementRef.current;
      triggerElementRef.current = null;
      if (el && typeof el.focus === 'function' && document.body.contains(el)) {
        el.focus();
      }
    };
  }, []);

  // Focus management and Escape key listener
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      // Focus trap
      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;

        const firstElement = focusable[0];
        const lastElement = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            lastElement.focus();
            e.preventDefault();
          }
        } else {
          if (document.activeElement === lastElement) {
            firstElement.focus();
            e.preventDefault();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    // Initial focus on first input
    const timer = setTimeout(() => {
      firstInputRef.current?.focus();
    }, 50);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
    };
  }, [isOpen, onClose]);

  // Reset state on close
  const handleModalClose = () => {
    if (status === 'success_delivered' || status === 'success_pending') {
      setName('');
      setCategory('general');
      setMessage('');
      setStatus('idle');
      setErrorMessage('');
    }
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const trimmedMessage = message.trim();
    if (trimmedMessage.length < 10) {
      setErrorMessage('Please enter at least 10 characters.');
      return;
    }
    if (trimmedMessage.length > 2000) {
      setErrorMessage('Message must not exceed 2000 characters.');
      return;
    }

    setStatus('loading');
    setErrorMessage('');

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim() || undefined,
          category,
          message: trimmedMessage,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setStatus('error');
        setErrorMessage(data.error || 'Failed to submit feedback. Please try again.');
        return;
      }

      if (data.emailDelivered) {
        setStatus('success_delivered');
      } else {
        // Durably persisted, email pending
        setStatus('success_pending');
      }
    } catch (err) {
      console.error('[FeedbackModal] Submission network error:', err);
      setStatus('error');
      setErrorMessage('Network error submitting feedback. Please try again.');
    }
  };

  if (!isOpen) return null;

  const isSuccess = status === 'success_delivered' || status === 'success_pending';

  return (
    <div
      className="feedback-modal-overlay"
      onClick={handleModalClose}
      role="presentation"
    >
      <div
        className="feedback-modal"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="feedback-modal-header">
          <div className="feedback-title-group">
            <span className="feedback-header-icon" aria-hidden="true">✉️</span>
            <h2 id="feedback-modal-title" className="feedback-modal-title">
              {isSuccess ? 'Feedback Received' : 'Reader Feedback'}
            </h2>
          </div>
          <button
            type="button"
            className="feedback-modal-close-btn"
            onClick={handleModalClose}
            aria-label="Close feedback dialog"
          >
            ✕
          </button>
        </div>

        {isSuccess ? (
          <div className="feedback-success-state">
            <div
              className={`feedback-success-icon-badge ${
                status === 'success_delivered' ? 'badge-delivered' : 'badge-pending'
              }`}
              aria-hidden="true"
            >
              {status === 'success_delivered' ? '✓' : 'ℹ'}
            </div>

            <h3 className="feedback-success-headline">
              {status === 'success_delivered'
                ? 'Thank you for your feedback!'
                : 'Feedback Saved'}
            </h3>

            <p className="feedback-success-message">
              {status === 'success_delivered'
                ? 'Your message has been received by our editorial team.'
                : "Your feedback was received. We'll send ourselves an email notification shortly."}
            </p>

            <button
              type="button"
              className="feedback-btn-primary feedback-close-action-btn"
              onClick={handleModalClose}
            >
              Done
            </button>
          </div>
        ) : (
          <form className="feedback-form" onSubmit={handleSubmit}>
            {status === 'error' && errorMessage && (
              <div className="feedback-alert-error" role="alert">
                <span className="feedback-error-icon" aria-hidden="true">⚠️</span>
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="feedback-field-row">
              <div className="feedback-field-group">
                <label htmlFor="feedback-name" className="feedback-label">
                  Your Name <span className="feedback-optional-tag">(Optional)</span>
                </label>
                <input
                  type="text"
                  id="feedback-name"
                  ref={firstInputRef}
                  className="feedback-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Anonymous"
                  maxLength={100}
                  disabled={status === 'loading'}
                />
              </div>

              <div className="feedback-field-group">
                <label htmlFor="feedback-category" className="feedback-label">
                  Category
                </label>
                <select
                  id="feedback-category"
                  className="feedback-select"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  disabled={status === 'loading'}
                >
                  <option value="general">General Feedback</option>
                  <option value="bug">Bug Report</option>
                  <option value="suggestion">Feature Suggestion</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            <div className="feedback-field-group">
              <div className="feedback-label-bar">
                <label htmlFor="feedback-message" className="feedback-label">
                  Message <span className="feedback-required-star" aria-hidden="true">*</span>
                </label>
                <span
                  className={`feedback-char-count ${
                    message.length > 2000 ? 'char-count-exceeded' : ''
                  }`}
                  aria-live="polite"
                >
                  {message.length}/2000
                </span>
              </div>
              <textarea
                id="feedback-message"
                className="feedback-textarea"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Tell us what you think, report an issue with an article, or suggest improvements..."
                rows={5}
                maxLength={2000}
                required
                disabled={status === 'loading'}
              />
              <span className="feedback-hint">
                Minimum 10 characters. Please avoid sharing sensitive personal data.
              </span>
            </div>

            <div className="feedback-modal-footer">
              <button
                type="button"
                className="feedback-btn-cancel"
                onClick={handleModalClose}
                disabled={status === 'loading'}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="feedback-btn-primary"
                disabled={status === 'loading' || message.trim().length < 10}
              >
                {status === 'loading' ? (
                  <>
                    <span className="feedback-spinner" aria-hidden="true"></span>
                    <span>Sending...</span>
                  </>
                ) : (
                  'Send Feedback'
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

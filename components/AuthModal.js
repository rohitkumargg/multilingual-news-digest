'use client';

import { useState, useEffect, useRef } from 'react';
import { signIn } from 'next-auth/react';

export default function AuthModal({
  isOpen,
  onClose,
  initialTab = 'login',
  onLoginSuccess,
}) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

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

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setError(null);
      setSuccessMessage(null);
      setEmail('');
      setPassword('');
      setConfirmPassword('');
    }
  }, [isOpen, initialTab]);

  // Keyboard navigation: Escape key to close, Tab / Shift+Tab focus trap
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      // Focus trap within modal
      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
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
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen, onClose]);

  // Auto-focus first input field when tab switches
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        firstInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [activeTab, isOpen]);

  if (!isOpen) return null;

  const handleLogin = async (e) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const res = await signIn('credentials', {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
      });

      if (res?.error) {
        setError('Invalid email or password. Please try again.');
        setIsLoading(false);
      } else {
        setIsLoading(false);
        let streakData = null;
        try {
          const streakRes = await fetch('/api/user/streak', { method: 'POST' });
          if (streakRes.ok) {
            streakData = await streakRes.json();
          }
        } catch (streakErr) {
          console.warn('[AuthModal] Failed to update streak:', streakErr);
        }

        setSuccessMessage('Successfully signed in! Welcome back.');
        setTimeout(() => {
          setIsLoading(false);
          if (onLoginSuccess) {
            onLoginSuccess({
              email: email.trim().toLowerCase(),
              isNewAccount: false,
              streakData,
            });
          }
          onClose();
        }, 600);
      }
    } catch (err) {
      console.error('[AuthModal] Login error:', err);
      setError('An unexpected error occurred. Please try again.');
      setIsLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch('/api/user/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || 'Failed to register account.');
        setIsLoading(false);
        return;
      }

      setSuccessMessage('Account created! Signing you in...');

      // Auto sign-in after registration
      const loginRes = await signIn('credentials', {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
      });

      if (loginRes?.error) {
        setError('Account created, but sign-in failed. Please sign in manually.');
        setActiveTab('login');
        setIsLoading(false);
      } else {
        setIsLoading(false);
        let streakData = null;
        try {
          const streakRes = await fetch('/api/user/streak', { method: 'POST' });
          if (streakRes.ok) {
            streakData = await streakRes.json();
          }
        } catch (streakErr) {
          console.warn('[AuthModal] Failed to update streak:', streakErr);
        }

        setSuccessMessage('Account created and signed in successfully!');
        setTimeout(() => {
          setIsLoading(false);
          if (onLoginSuccess) {
            onLoginSuccess({
              email: email.trim().toLowerCase(),
              isNewAccount: true,
              streakData,
            });
          }
          onClose();
        }, 600);
      }
    } catch (err) {
      console.error('[AuthModal] Registration error:', err);
      setError('Network error occurred. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <div
      className="modal-backdrop auth-modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div
        className="modal-container auth-modal-container"
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="modal-close-btn"
          onClick={onClose}
          aria-label="Close authentication modal"
        >
          ✕
        </button>

        <div className="auth-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'login'}
            className={`auth-tab-btn ${activeTab === 'login' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('login');
              setError(null);
              setSuccessMessage(null);
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'register'}
            className={`auth-tab-btn ${activeTab === 'register' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('register');
              setError(null);
              setSuccessMessage(null);
            }}
          >
            Create Account
          </button>
        </div>

        <h2 id="auth-modal-title" className="auth-modal-title">
          {activeTab === 'login' ? 'Welcome Back' : 'Create an MND Account'}
        </h2>
        <p className="auth-modal-subtitle">
          {activeTab === 'login'
            ? 'Sign in to sync your login streak and bookmark articles.'
            : 'Register to track daily streaks and save stories for offline reading.'}
        </p>

        {error && (
          <div className="auth-alert auth-alert-error" role="alert">
            <span aria-hidden="true">⚠️</span> {error}
          </div>
        )}

        {successMessage && (
          <div className="auth-alert auth-alert-success" role="status">
            <span aria-hidden="true">✓</span> {successMessage}
          </div>
        )}

        {activeTab === 'login' ? (
          <form onSubmit={handleLogin} className="auth-form">
            <div className="form-group">
              <label htmlFor="login-email">Email Address</label>
              <input
                ref={activeTab === 'login' ? firstInputRef : null}
                id="login-email"
                type="email"
                className="auth-input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                disabled={isLoading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="login-password">Password</label>
              <input
                id="login-password"
                type="password"
                className="auth-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                disabled={isLoading}
              />
            </div>

            <button
              type="submit"
              className="auth-submit-btn"
              disabled={isLoading}
            >
              {isLoading ? 'Signing In...' : 'Sign In'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="auth-form">
            <div className="form-group">
              <label htmlFor="register-email">Email Address</label>
              <input
                ref={activeTab === 'register' ? firstInputRef : null}
                id="register-email"
                type="email"
                className="auth-input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                disabled={isLoading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="register-password">Password (min 8 characters)</label>
              <input
                id="register-password"
                type="password"
                className="auth-input"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                disabled={isLoading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="register-confirm-password">Confirm Password</label>
              <input
                id="register-confirm-password"
                type="password"
                className="auth-input"
                placeholder="Re-enter password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                disabled={isLoading}
              />
            </div>

            <button
              type="submit"
              className="auth-submit-btn"
              disabled={isLoading}
            >
              {isLoading ? 'Creating Account...' : 'Create Account'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}


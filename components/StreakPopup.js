'use client';

import { useEffect } from 'react';

export default function StreakPopup({
  streakData,
  authData,
  onClose,
}) {
  const { type, current_streak } = streakData || {};
  const isAuthLogin = Boolean(authData);

  useEffect(() => {
    // If neither an auth login notification nor an active streak notification, exit
    if (!isAuthLogin && (!type || type === 'same_day')) return;

    const timer = setTimeout(() => {
      if (onClose) onClose();
    }, 5000);

    return () => clearTimeout(timer);
  }, [type, isAuthLogin, onClose]);

  if (!isAuthLogin && (!type || type === 'same_day')) {
    return null;
  }

  let title = 'Successfully Signed In!';
  let message = 'You have successfully signed in.';
  let badge = '✅';

  if (authData?.isNewAccount) {
    badge = '🎉';
    title = 'Successfully Signed In!';
    message = authData?.email
      ? `Welcome, ${authData.email}! Your MND account was created and you are now signed in.`
      : 'Welcome! Your MND account was created and you are now signed in.';
  } else if (type === 'increment') {
    badge = '🔥';
    title = 'Successfully Signed In!';
    message = `Welcome back! 🔥 ${current_streak}-day reading streak!`;
  } else if (type === 'first') {
    badge = '🔥';
    title = 'Successfully Signed In!';
    message = 'Welcome! Your streak has started. 🔥 Day 1!';
  } else if (type === 'reset') {
    badge = '🔄';
    title = 'Successfully Signed In!';
    message = 'Streak reset after inactivity. 🔥 Day 1!';
  } else if (authData?.email) {
    badge = '✅';
    title = 'Successfully Signed In!';
    message = `Welcome back, ${authData.email}! You have successfully signed in.`;
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
      e.preventDefault();
      if (onClose) onClose();
    }
  };

  return (
    <aside
      className="streak-popup"
      role="status"
      aria-live="polite"
      onClick={onClose}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      title="Click or press Enter to dismiss"
      aria-label={`Notification: ${message}`}
    >
      <div className="streak-popup-icon" aria-hidden="true">
        {badge}
      </div>
      <div className="streak-popup-content">
        <div className="streak-popup-title">{title}</div>
        <p className="streak-popup-message">{message}</p>
      </div>
      <button
        type="button"
        className="streak-popup-close-btn"
        onClick={(e) => {
          e.stopPropagation();
          if (onClose) onClose();
        }}
        aria-label="Dismiss notification"
      >
        ✕
      </button>
    </aside>
  );
}

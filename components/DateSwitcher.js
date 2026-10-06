'use client';

import { useMemo } from 'react';
import { getUiTranslation } from '@/lib/translations';

export default function DateSwitcher({
  selectedDate = 'today',
  onSelectDate,
  selectedLanguage = 'en',
}) {
  const isBackDate = selectedDate !== 'today';
  if (!isBackDate) return null;

  const viewingArchiveLabel = getUiTranslation(selectedLanguage, 'viewingArchive') || 'Viewing archive:';
  const backToTodayLabel = getUiTranslation(selectedLanguage, 'backToToday') || 'Back to Today';

  return (
    <div className="archive-notice-bar" role="alert">
      <span className="archive-notice-text">
        {viewingArchiveLabel} <strong>{selectedDate}</strong>
      </span>
      <button
        type="button"
        className="archive-notice-close"
        onClick={() => onSelectDate('today')}
        aria-label={backToTodayLabel}
      >
        {backToTodayLabel} ✕
      </button>
    </div>
  );
}

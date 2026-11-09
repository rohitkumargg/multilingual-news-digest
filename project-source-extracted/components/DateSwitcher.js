'use client';

import { useMemo } from 'react';
import { getUiTranslation } from '@/lib/translations';

export default function DateSwitcher({
  selectedDate = 'today',
  onSelectDate,
  searchQuery = '',
  onSearchChange,
  selectedLanguage = 'en',
}) {
  const todayYmd = useMemo(() => {
    return new Date().toISOString().slice(0, 10);
  }, []);

  const backToTodayLabel = getUiTranslation(selectedLanguage, 'backToToday') || 'Return to Today';
  const searchPlaceholder = getUiTranslation(selectedLanguage, 'searchPlaceholder') || 'Search headlines...';
  const dateLabel = getUiTranslation(selectedLanguage, 'dateLabel') || 'Date:';
  const selectDateLabel = getUiTranslation(selectedLanguage, 'selectDate') || 'Select news date';
  const viewingArchiveLabel = getUiTranslation(selectedLanguage, 'viewingArchive') || 'Viewing archived news from:';
  const clearSearchLabel = getUiTranslation(selectedLanguage, 'clearSearch') || 'Clear search filter';

  const isBackDate = selectedDate !== 'today';

  // Current value for native date input
  const datePickerValue = isBackDate ? selectedDate : todayYmd;

  const handleDateChange = (e) => {
    const val = e.target.value;
    if (!val) return;
    if (val === todayYmd) {
      onSelectDate('today');
    } else {
      onSelectDate(val);
    }
  };

  return (
    <div className="date-switcher-bar">
      <div className="date-switcher-inner">
        {/* Single Calendar Option */}
        <div className="date-controls-group">
          <div className="calendar-single-wrapper">
            <span className="calendar-icon" aria-hidden="true">📅</span>
            <label htmlFor="news-calendar-picker" className="calendar-picker-label">
              {dateLabel}
            </label>
            <input
              id="news-calendar-picker"
              type="date"
              max={todayYmd}
              value={datePickerValue}
              onChange={handleDateChange}
              className="calendar-date-input"
              aria-label={selectDateLabel}
            />
          </div>

          {isBackDate && (
            <button
              type="button"
              className="return-today-pill-btn"
              onClick={() => onSelectDate('today')}
              title={backToTodayLabel}
            >
              <span>⚡ {backToTodayLabel}</span>
            </button>
          )}
        </div>

        {/* Search Filter */}
        <div className="date-tools-right">
          <div className="search-filter-box">
            <span className="search-icon" aria-hidden="true">🔍</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="search-input"
              aria-label={searchPlaceholder}
            />
            {searchQuery && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => onSearchChange('')}
                aria-label={clearSearchLabel}
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Back Date Notice (Only shown when back date selected) */}
      {isBackDate && (
        <div className="date-status-subbar">
          <div className="date-status-subbar-inner">
            <div className="active-archive-alert">
              <span className="archive-icon" aria-hidden="true">⏪</span>
              <span className="archive-text">
                {viewingArchiveLabel} <strong>{selectedDate}</strong>
              </span>
              <button
                type="button"
                className="reset-date-btn"
                onClick={() => onSelectDate('today')}
              >
                {backToTodayLabel} ✕
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

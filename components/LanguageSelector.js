/**
 * MND — Multilingual News Digest
 * Language Selector Component.
 * 
 * Visually consistent with StateSelector.
 * Supports Indian languages only.
 */

import { SUPPORTED_LANGUAGES } from '@/lib/languages';
import { getUiTranslation } from '@/lib/translations';

export default function LanguageSelector({ selectedLanguage, onLanguageChange }) {
  const ariaLabel = getUiTranslation(selectedLanguage, 'selectLanguage');

  return (
    <div className="language-selector-wrapper">
      <select
        id="language-selector"
        value={selectedLanguage || 'en'}
        onChange={(e) => onLanguageChange(e.target.value)}
        aria-label={ariaLabel}
        className="language-select"
      >
        {SUPPORTED_LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.code === 'en' ? lang.name : `${lang.nativeName} (${lang.name})`}
          </option>
        ))}
      </select>
    </div>
  );
}

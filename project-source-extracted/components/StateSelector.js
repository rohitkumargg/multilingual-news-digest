import { INDIAN_STATES } from '@/lib/constants';
import { UI_TRANSLATIONS, getUiTranslation } from '@/lib/translations';

export default function StateSelector({ selectedState, onStateChange, selectedLanguage = 'en' }) {
  const langStates = UI_TRANSLATIONS[selectedLanguage]?.states || UI_TRANSLATIONS.en.states;
  const ariaLabel = getUiTranslation(selectedLanguage, 'selectState');

  return (
    <div className="state-selector-wrapper">
      <select
        id="state-selector"
        value={selectedState || 'all'}
        onChange={(e) => onStateChange(e.target.value)}
        aria-label={ariaLabel}
        className="state-select"
      >
        {INDIAN_STATES.map((state) => (
          <option key={state.value} value={state.value}>
            {langStates[state.value] || state.label}
          </option>
        ))}
      </select>
    </div>
  );
}

import StateSelector from './StateSelector';
import LanguageSelector from './LanguageSelector';
import { getUiTranslation } from '@/lib/translations';

export default function Header({
  selectedState,
  onStateChange,
  selectedLanguage = 'en',
  onLanguageChange,
}) {
  const tagline = getUiTranslation(selectedLanguage, 'appTagline');

  return (
    <header className="header">
      <div className="header-inner">
        <div className="brand">
          <div className="brand-logo">MND</div>
          <div className="brand-tagline">{tagline}</div>
        </div>
        <div className="header-controls">
          <StateSelector
            selectedState={selectedState}
            onStateChange={onStateChange}
            selectedLanguage={selectedLanguage}
          />
          <LanguageSelector
            selectedLanguage={selectedLanguage}
            onLanguageChange={onLanguageChange}
          />
        </div>
      </div>
    </header>
  );
}

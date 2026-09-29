import { getUiTranslation } from '@/lib/translations';

export default function LoadingState({ selectedLanguage = 'en' }) {
  const loadingText = getUiTranslation(selectedLanguage, 'loadingMessage');

  return (
    <div className="loading-container">
      <p>{loadingText}</p>
      <div className="loading-dots">
        <span></span>
        <span></span>
        <span></span>
      </div>
    </div>
  );
}

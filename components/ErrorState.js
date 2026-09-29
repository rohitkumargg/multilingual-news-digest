import { getUiTranslation } from '@/lib/translations';

export default function ErrorState({ message, onRetry, selectedLanguage = 'en' }) {
  const defaultErrorMessage = getUiTranslation(selectedLanguage, 'errorMessage');
  const tryAgainText = getUiTranslation(selectedLanguage, 'tryAgain');

  return (
    <div className="error-container">
      <div className="error-icon" aria-hidden="true">⚠️</div>
      <p className="error-message">{message || defaultErrorMessage}</p>
      {onRetry && (
        <button onClick={onRetry} className="error-retry-btn">
          {tryAgainText}
        </button>
      )}
    </div>
  );
}

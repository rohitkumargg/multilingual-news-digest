import { getUiTranslation } from '@/lib/translations';

export default function Footer({ selectedLanguage = 'en' }) {
  const copyright = getUiTranslation(selectedLanguage, 'footerCopyright');
  const tagline = getUiTranslation(selectedLanguage, 'footerTagline');

  return (
    <footer className="footer">
      <p>{copyright}</p>
      <p>{tagline}</p>
    </footer>
  );
}

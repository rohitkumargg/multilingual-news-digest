/**
 * MND — Multilingual News Digest
 * Indian Languages Configuration.
 * 
 * Supports 12 Indian languages as per requirements, extensible for more.
 * Uses official Bhashini ISO 639-1 / 639-2 language codes.
 */

export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు' },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்' },
  { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી' },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ' },
  { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം' },
  { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ' },
  { code: 'or', name: 'Odia', nativeName: 'ଓଡ଼ିଆ' },
  { code: 'as', name: 'Assamese', nativeName: 'অসমীয়া' },
];

export const DEFAULT_LANGUAGE = 'en';

export const LANGUAGE_CODES = SUPPORTED_LANGUAGES.map((lang) => lang.code);

export function isValidLanguageCode(code) {
  return typeof code === 'string' && LANGUAGE_CODES.includes(code.toLowerCase());
}

export function getLanguageInfo(code) {
  return SUPPORTED_LANGUAGES.find((lang) => lang.code === code) || SUPPORTED_LANGUAGES[0];
}

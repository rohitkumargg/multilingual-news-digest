/**
 * MND — Multilingual News Digest
 * Central configuration: categories, Indian states, and app constants.
 */

export const CATEGORIES = [
  { id: 'politics', label: 'Politics & National', icon: '🏛️' },
  { id: 'business', label: 'Business & Economy', icon: '📈' },
  { id: 'technology', label: 'Technology & AI', icon: '💻' },
  { id: 'sports', label: 'Sports', icon: '🏏' },
  { id: 'education', label: 'Education & Career', icon: '📚' },
  { id: 'entertainment', label: 'Entertainment & Cinema', icon: '🎬' },
];

export const INDIAN_STATES = [
  { value: 'all', label: 'All India' },
  { value: 'Andhra Pradesh', label: 'Andhra Pradesh' },
  { value: 'Arunachal Pradesh', label: 'Arunachal Pradesh' },
  { value: 'Assam', label: 'Assam' },
  { value: 'Bihar', label: 'Bihar' },
  { value: 'Chhattisgarh', label: 'Chhattisgarh' },
  { value: 'Goa', label: 'Goa' },
  { value: 'Gujarat', label: 'Gujarat' },
  { value: 'Haryana', label: 'Haryana' },
  { value: 'Himachal Pradesh', label: 'Himachal Pradesh' },
  { value: 'Jharkhand', label: 'Jharkhand' },
  { value: 'Karnataka', label: 'Karnataka' },
  { value: 'Kerala', label: 'Kerala' },
  { value: 'Madhya Pradesh', label: 'Madhya Pradesh' },
  { value: 'Maharashtra', label: 'Maharashtra' },
  { value: 'Manipur', label: 'Manipur' },
  { value: 'Meghalaya', label: 'Meghalaya' },
  { value: 'Mizoram', label: 'Mizoram' },
  { value: 'Nagaland', label: 'Nagaland' },
  { value: 'Odisha', label: 'Odisha' },
  { value: 'Punjab', label: 'Punjab' },
  { value: 'Rajasthan', label: 'Rajasthan' },
  { value: 'Sikkim', label: 'Sikkim' },
  { value: 'Tamil Nadu', label: 'Tamil Nadu' },
  { value: 'Telangana', label: 'Telangana' },
  { value: 'Tripura', label: 'Tripura' },
  { value: 'Uttar Pradesh', label: 'Uttar Pradesh' },
  { value: 'Uttarakhand', label: 'Uttarakhand' },
  { value: 'West Bengal', label: 'West Bengal' },
  // Union Territories
  { value: 'Andaman and Nicobar Islands', label: 'Andaman & Nicobar Islands' },
  { value: 'Chandigarh', label: 'Chandigarh' },
  { value: 'Dadra and Nagar Haveli and Daman and Diu', label: 'Dadra & Nagar Haveli and Daman & Diu' },
  { value: 'Delhi', label: 'Delhi' },
  { value: 'Jammu and Kashmir', label: 'Jammu & Kashmir' },
  { value: 'Ladakh', label: 'Ladakh' },
  { value: 'Lakshadweep', label: 'Lakshadweep' },
  { value: 'Puducherry', label: 'Puducherry' },
];

/** Google News RSS search query keywords per category */
export const CATEGORY_KEYWORDS = {
  politics: 'Politics government parliament election foreign affairs national',
  business: 'Business economy markets finance sensex rupee stock',
  technology: 'Technology artificial intelligence startup IT software gadgets',
  sports: 'Sports cricket IPL football tournament',
  education: 'Education university exam board CBSE NEET JEE admissions',
  entertainment: 'Entertainment cinema movies bollywood box office OTT',
};

/** Fallback image path when article has no image (deprecated) */
export const FALLBACK_IMAGE = '/fallback-news.svg';

/**
 * Detects whether an image URL is a generic placeholder, Google News app icon / logo,
 * tracking pixel, or corrupted resource.
 */
export function isPlaceholderOrCorruptedImage(url) {
  if (!url || typeof url !== 'string') return true;
  const trimmed = url.trim();
  if (trimmed === '' || trimmed === '/fallback-news.svg') return true;

  const lower = trimmed.toLowerCase();

  // Filter Google News default logo / icon (e.g. the "GE" colorful fold icon)
  if (
    lower.includes('googleusercontent.com') ||
    lower.includes('gstatic.com') ||
    lower.includes('news.google.com') ||
    lower.includes('google.com/logos') ||
    lower.includes('google.com/images')
  ) {
    return true;
  }

  // Filter generic placeholder keywords
  if (
    lower.includes('fallback') ||
    lower.includes('placeholder') ||
    lower.includes('no-image') ||
    lower.includes('no_image') ||
    lower.includes('default-image') ||
    lower.includes('default_image') ||
    lower.includes('default-news') ||
    lower.includes('default_news') ||
    lower.includes('blank.gif') ||
    lower.includes('spacer.gif') ||
    lower.includes('1x1') ||
    lower.startsWith('data:image')
  ) {
    return true;
  }

  // Must be valid http/https URL
  if (!lower.startsWith('http://') && !lower.startsWith('https://')) {
    return true;
  }

  return false;
}

/** Server-side cache TTL in seconds */
export const CACHE_TTL = 300; // 5 minutes

/** Maximum articles per category (1 lead + 5 chronological stories below) */
export const MAX_ARTICLES_PER_CATEGORY = 6;


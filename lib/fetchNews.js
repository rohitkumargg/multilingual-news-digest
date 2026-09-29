/**
 * MND — Client-side news fetching & translation utility.
 * Calls /api/news and /api/translate endpoints.
 */

import { CATEGORIES } from './constants';

/**
 * Fetch news articles for a single category, state, and language.
 *
 * @param {string} category - Category id (sports, education, technology, politics)
 * @param {string} state - State value ('all' or state name)
 * @param {string} lang - Language code ('en', 'hi', 'te', etc.)
 * @returns {Promise<Array>} Array of article objects
 */
export async function fetchNewsByCategory(category, state = 'all', lang = 'en') {
  const params = new URLSearchParams({ category, state, lang });
  const response = await fetch(`/api/news?${params.toString()}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch ${category} news: ${response.status}`);
  }

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Unknown error');
  }

  return data.articles || [];
}

/**
 * Fetch news for all categories in parallel.
 *
 * @param {string} state - State value ('all' or state name)
 * @param {string} lang - Language code
 * @returns {Promise<Object>} { sports: [...], education: [...], ... }
 */
export async function fetchAllCategories(state = 'all', lang = 'en') {
  const results = await Promise.allSettled(
    CATEGORIES.map(async (cat) => {
      const articles = await fetchNewsByCategory(cat.id, state, lang);
      return { categoryId: cat.id, articles };
    })
  );

  const newsData = {};

  results.forEach((result, index) => {
    const categoryId = CATEGORIES[index].id;
    if (result.status === 'fulfilled') {
      newsData[categoryId] = result.value.articles;
    } else {
      console.warn(`Failed to fetch ${categoryId}:`, result.reason);
      newsData[categoryId] = [];
    }
  });

  return newsData;
}

/**
 * Translate a set of news articles client-side without re-fetching RSS.
 * Calls server-side /api/translate.
 *
 * @param {Array<Object>} articles - Articles with { id, title, summary }
 * @param {string} targetLanguage - Target Indian language code
 * @returns {Promise<Array<Object>>} Translated articles
 */
export async function translateArticles(articles, targetLanguage) {
  if (!articles || articles.length === 0 || targetLanguage === 'en') {
    return articles;
  }

  try {
    const res = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        articles,
        targetLanguage,
      }),
    });

    if (!res.ok) {
      console.warn(`[Client] Translation API returned status ${res.status}`);
      return articles;
    }

    const data = await res.json();
    return data.translatedArticles || articles;
  } catch (err) {
    console.warn('[Client] Translation request failed, falling back:', err.message);
    return articles;
  }
}

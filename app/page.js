'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Header from '@/components/Header';
import CategorySection from '@/components/CategorySection';
import ArticleReaderModal from '@/components/ArticleReaderModal';
import LoadingState from '@/components/LoadingState';
import ErrorState from '@/components/ErrorState';
import Footer from '@/components/Footer';
import { CATEGORIES, INDIAN_STATES } from '@/lib/constants';
import { fetchAllCategories, translateArticles } from '@/lib/fetchNews';
import { UI_TRANSLATIONS, getUiTranslation } from '@/lib/translations';
import { isValidLanguageCode } from '@/lib/languages';

const STORAGE_LANG_KEY = 'mnd_language';

export default function HomePage() {
  const [selectedState, setSelectedState] = useState('all');
  const [selectedLanguage, setSelectedLanguage] = useState('en');
  const [rawNewsData, setRawNewsData] = useState({});
  const [displayedNewsData, setDisplayedNewsData] = useState({});
  const [loading, setLoading] = useState(true);
  const [isTranslating, setIsTranslating] = useState(false);
  const [error, setError] = useState(null);

  // In-website Reader state
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [activeCategoryArticles, setActiveCategoryArticles] = useState([]);

  // Client-side translation cache: { [state]: { [lang]: categoryNewsMap } }
  const translationCacheRef = useRef({});

  // 1. Restore persisted language preference from localStorage on mount
  useEffect(() => {
    try {
      const savedLang = localStorage.getItem(STORAGE_LANG_KEY);
      if (savedLang && isValidLanguageCode(savedLang)) {
        setSelectedLanguage(savedLang);
      }
    } catch {
      // localStorage may fail in restricted/private contexts
    }
  }, []);

  // 2. Fetch raw English news when state changes
  const loadNews = useCallback(async (state) => {
    setLoading(true);
    setError(null);

    try {
      const data = await fetchAllCategories(state, 'en');
      setRawNewsData(data);
      // Initialize translation cache for this state with English
      if (!translationCacheRef.current[state]) {
        translationCacheRef.current[state] = {};
      }
      translationCacheRef.current[state].en = data;
    } catch (err) {
      console.error('[MND] Failed to fetch news:', err);
      setError('Something went wrong while fetching the latest news. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch news on mount or when state changes
  useEffect(() => {
    loadNews(selectedState);
  }, [selectedState, loadNews]);

  // 3. Update displayed news whenever rawNewsData or selectedLanguage changes
  useEffect(() => {
    if (loading || Object.keys(rawNewsData).length === 0) return;

    // English: directly display raw data
    if (selectedLanguage === 'en') {
      setDisplayedNewsData(rawNewsData);
      setIsTranslating(false);
      return;
    }

    // Check client translation cache first
    const cachedForState = translationCacheRef.current[selectedState];
    if (cachedForState && cachedForState[selectedLanguage]) {
      setDisplayedNewsData(cachedForState[selectedLanguage]);
      setIsTranslating(false);
      return;
    }

    // Translate only the articles currently being displayed
    let isCancelled = false;

    async function applyTranslation() {
      setIsTranslating(true);

      try {
        const flatArticles = [];
        const categoryMap = [];

        CATEGORIES.forEach((cat) => {
          const list = rawNewsData[cat.id] || [];
          list.forEach((article) => {
            flatArticles.push(article);
            categoryMap.push(cat.id);
          });
        });

        if (flatArticles.length === 0) {
          setDisplayedNewsData(rawNewsData);
          setIsTranslating(false);
          return;
        }

        const translated = await translateArticles(flatArticles, selectedLanguage);

        if (isCancelled) return;

        // Reconstruct category map
        const translatedMap = {};
        CATEGORIES.forEach((cat) => {
          translatedMap[cat.id] = [];
        });

        translated.forEach((art, idx) => {
          const catId = categoryMap[idx];
          if (translatedMap[catId]) {
            translatedMap[catId].push(art);
          }
        });

        // Cache the translated view for this state & language
        if (!translationCacheRef.current[selectedState]) {
          translationCacheRef.current[selectedState] = {};
        }
        translationCacheRef.current[selectedState][selectedLanguage] = translatedMap;

        setDisplayedNewsData(translatedMap);
      } catch (transErr) {
        console.warn('[MND] Translation failed, retaining current content:', transErr);
        // Fallback gracefully to original English news
        if (!isCancelled) {
          setDisplayedNewsData(rawNewsData);
        }
      } finally {
        if (!isCancelled) {
          setIsTranslating(false);
        }
      }
    }

    applyTranslation();

    return () => {
      isCancelled = true;
    };
  }, [rawNewsData, selectedLanguage, selectedState, loading]);

  // Keep selected article in sync if translations update while reader is open
  useEffect(() => {
    if (!selectedArticle) return;
    for (const catId of Object.keys(displayedNewsData)) {
      const articles = displayedNewsData[catId] || [];
      const match = articles.find(
        (a) => (a.id && a.id === selectedArticle.id) || a.title === selectedArticle.title || a.link === selectedArticle.link
      );
      if (match) {
        setSelectedArticle(match);
        setActiveCategoryArticles(articles);
        break;
      }
    }
  }, [displayedNewsData]);

  // In-website Reader Handlers
  const handleSelectArticle = (article, categoryId) => {
    setSelectedArticle(article);
    const catList = displayedNewsData[categoryId || article.category] || [];
    setActiveCategoryArticles(catList);
  };

  const handleCloseReader = () => {
    setSelectedArticle(null);
  };

  const handleNavigateArticle = (direction) => {
    if (!selectedArticle || activeCategoryArticles.length === 0) return;
    const currentIndex = activeCategoryArticles.findIndex(
      (a) => (a.id && a.id === selectedArticle.id) || a.title === selectedArticle.title || a.link === selectedArticle.link
    );
    if (currentIndex === -1) return;

    if (direction === 'prev' && currentIndex > 0) {
      setSelectedArticle(activeCategoryArticles[currentIndex - 1]);
    } else if (direction === 'next' && currentIndex < activeCategoryArticles.length - 1) {
      setSelectedArticle(activeCategoryArticles[currentIndex + 1]);
    }
  };

  // Determine prev/next status
  const currentArticleIndex = selectedArticle && activeCategoryArticles.length > 0
    ? activeCategoryArticles.findIndex(
        (a) => (a.id && a.id === selectedArticle.id) || a.title === selectedArticle.title || a.link === selectedArticle.link
      )
    : -1;
  const hasPrev = currentArticleIndex > 0;
  const hasNext = currentArticleIndex >= 0 && currentArticleIndex < activeCategoryArticles.length - 1;

  // Handlers
  const handleStateChange = (newState) => {
    setSelectedState(newState);
  };

  const handleLanguageChange = (newLang) => {
    if (!isValidLanguageCode(newLang)) return;
    setSelectedLanguage(newLang);
    try {
      localStorage.setItem(STORAGE_LANG_KEY, newLang);
    } catch {
      // Ignore localStorage write error
    }
  };

  const handleRetry = () => {
    loadNews(selectedState);
  };

  // Localized UI strings
  const pageTitle = getUiTranslation(selectedLanguage, 'pageTitle');
  const pageSubtitlePrefix = getUiTranslation(selectedLanguage, 'pageSubtitlePrefix');
  const acrossIndia = getUiTranslation(selectedLanguage, 'acrossIndia');
  const fromPrefix = getUiTranslation(selectedLanguage, 'fromPrefix');
  
  const localizedStates = UI_TRANSLATIONS[selectedLanguage]?.states || UI_TRANSLATIONS.en.states;
  const stateLabel =
    selectedState === 'all'
      ? acrossIndia
      : `${fromPrefix} ${localizedStates[selectedState] || selectedState}`;

  return (
    <>
      <Header
        selectedState={selectedState}
        onStateChange={handleStateChange}
        selectedLanguage={selectedLanguage}
        onLanguageChange={handleLanguageChange}
      />

      <main>
        {/* Page Title & Subtitle */}
        <div className="page-title-section">
          <div className="page-title-row">
            <h1 className="page-title">{pageTitle}</h1>
            {isTranslating && (
              <span className="translating-indicator" aria-live="polite">
                <span className="translating-spinner"></span>
              </span>
            )}
          </div>
          <p className="page-subtitle">
            {pageSubtitlePrefix} {stateLabel}
          </p>
        </div>

        {/* Loading State */}
        {loading && <LoadingState selectedLanguage={selectedLanguage} />}

        {/* Error State */}
        {error && !loading && (
          <ErrorState
            message={error}
            onRetry={handleRetry}
            selectedLanguage={selectedLanguage}
          />
        )}

        {/* News Categories */}
        {!loading && !error && (
          <>
            {CATEGORIES.map((category) => (
              <CategorySection
                key={category.id}
                category={category}
                articles={displayedNewsData[category.id] || []}
                loading={false}
                selectedLanguage={selectedLanguage}
                onSelectArticle={(art) => handleSelectArticle(art, category.id)}
              />
            ))}
          </>
        )}
      </main>

      {/* In-Website Article Reader Modal (No Redirecting) */}
      {selectedArticle && (
        <ArticleReaderModal
          article={selectedArticle}
          selectedLanguage={selectedLanguage}
          onClose={handleCloseReader}
          onNavigate={handleNavigateArticle}
          hasPrev={hasPrev}
          hasNext={hasNext}
        />
      )}

      <Footer selectedLanguage={selectedLanguage} />
    </>
  );
}

'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Header from '@/components/Header';
import CategoryNav from '@/components/CategoryNav';
import DateSwitcher from '@/components/DateSwitcher';
import NewsTicker from '@/components/NewsTicker';
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
  const [selectedDate, setSelectedDate] = useState('today');
  const [searchQuery, setSearchQuery] = useState('');
  const [rawNewsData, setRawNewsData] = useState({});
  const [displayedNewsData, setDisplayedNewsData] = useState({});
  const [loading, setLoading] = useState(true);
  const [isTranslating, setIsTranslating] = useState(false);
  const [error, setError] = useState(null);

  const [activeCategory, setActiveCategory] = useState('all');

  // In-website Reader state
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [activeCategoryArticles, setActiveCategoryArticles] = useState([]);

  // Client-side translation cache: { [cacheKey]: { [lang]: categoryNewsMap } }
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

  // 2. Fetch raw English news when state or date changes
  const loadNews = useCallback(async (state, date) => {
    setLoading(true);
    setError(null);

    const cacheKey = `${state}_${date}`;
    // Check if English data is cached for this state & date
    if (translationCacheRef.current[cacheKey] && translationCacheRef.current[cacheKey].en) {
      setRawNewsData(translationCacheRef.current[cacheKey].en);
      setLoading(false);
      return;
    }

    try {
      const data = await fetchAllCategories(state, 'en', date);
      setRawNewsData(data);
      if (!translationCacheRef.current[cacheKey]) {
        translationCacheRef.current[cacheKey] = {};
      }
      translationCacheRef.current[cacheKey].en = data;
    } catch (err) {
      console.error('[MND] Failed to fetch news:', err);
      setError('Something went wrong while fetching the news. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch news on mount or when state or date changes
  useEffect(() => {
    loadNews(selectedState, selectedDate);
  }, [selectedState, selectedDate, loadNews]);

  // 3. Update displayed news whenever rawNewsData or selectedLanguage changes
  useEffect(() => {
    if (loading || Object.keys(rawNewsData).length === 0) return;

    // English: directly display raw data
    if (selectedLanguage === 'en') {
      setDisplayedNewsData(rawNewsData);
      setIsTranslating(false);
      return;
    }

    const cacheKey = `${selectedState}_${selectedDate}`;

    // Check client translation cache first, ensuring it is not stale untranslated English
    const cachedForState = translationCacheRef.current[cacheKey];
    if (cachedForState && cachedForState[selectedLanguage]?._isTranslatedFor === selectedLanguage) {
      setDisplayedNewsData(cachedForState[selectedLanguage]);
      setIsTranslating(false);
      return;
    }

    // Translate articles currently being displayed
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

        // Cache the translated view for this state, date & language
        translatedMap._isTranslatedFor = selectedLanguage;
        if (!translationCacheRef.current[cacheKey]) {
          translationCacheRef.current[cacheKey] = {};
        }
        translationCacheRef.current[cacheKey][selectedLanguage] = translatedMap;

        setDisplayedNewsData(translatedMap);
      } catch (transErr) {
        console.warn('[MND] Translation failed:', transErr);
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
  }, [rawNewsData, selectedLanguage, selectedState, selectedDate, loading]);

  // Filter news data based on search and arrange strictly by publication date (newest on top, older below)
  const filteredNewsData = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const result = {};

    CATEGORIES.forEach((cat) => {
      let list = displayedNewsData[cat.id] || [];

      if (q) {
        list = list.filter((a) => {
          const t = (a.title || '').toLowerCase();
          const s = (a.summary || a.snippet || '').toLowerCase();
          const src = (a.source || '').toLowerCase();
          return t.includes(q) || s.includes(q) || src.includes(q);
        });
      }

      // Strictly arrange chronologically: newest at top, older below
      const sorted = [...list].sort((a, b) => {
        const dateA = new Date(a.pubDate).getTime();
        const dateB = new Date(b.pubDate).getTime();
        if (isNaN(dateA) && isNaN(dateB)) return 0;
        if (isNaN(dateA)) return 1;
        if (isNaN(dateB)) return -1;
        return dateB - dateA;
      });

      result[cat.id] = sorted;
    });

    return result;
  }, [displayedNewsData, searchQuery]);

  // Compute category article counts and flat list for ticker
  const { categoryCounts, allFlatArticles } = useMemo(() => {
    const counts = { all: 0 };
    const flat = [];
    CATEGORIES.forEach((cat) => {
      const articles = filteredNewsData[cat.id] || [];
      counts[cat.id] = articles.length;
      counts.all += articles.length;
      articles.forEach((a) => {
        flat.push({ ...a, category: cat.id });
      });
    });

    // Chronological order for ticker: newest first
    flat.sort((a, b) => {
      const dateA = new Date(a.pubDate).getTime() || 0;
      const dateB = new Date(b.pubDate).getTime() || 0;
      return dateB - dateA;
    });

    return { categoryCounts: counts, allFlatArticles: flat };
  }, [filteredNewsData]);

  // Keep selected article in sync if translations update while reader is open
  useEffect(() => {
    if (!selectedArticle) return;
    for (const catId of Object.keys(filteredNewsData)) {
      const articles = filteredNewsData[catId] || [];
      const match = articles.find(
        (a) => (a.id && a.id === selectedArticle.id) || a.title === selectedArticle.title || a.link === selectedArticle.link
      );
      if (match) {
        setSelectedArticle(match);
        setActiveCategoryArticles(articles);
        break;
      }
    }
  }, [filteredNewsData]);

  // In-website Reader Handlers
  const handleSelectArticle = (article, categoryId) => {
    setSelectedArticle(article);
    const catList = filteredNewsData[categoryId || article.category] || [];
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
    loadNews(selectedState, selectedDate);
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

      {/* Interactive News Categories Navigation Bar */}
      <CategoryNav
        categories={CATEGORIES}
        activeCategory={activeCategory}
        onSelectCategory={setActiveCategory}
        categoryCounts={categoryCounts}
        selectedLanguage={selectedLanguage}
      />

      {/* Date Switcher (Back Dates & Calendar) + Search Filter & Chronological Badge */}
      <DateSwitcher
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedLanguage={selectedLanguage}
      />

      {/* Latest / Breaking News Ticker */}
      {!loading && allFlatArticles.length > 0 && (
        <NewsTicker
          articles={allFlatArticles}
          onSelectArticle={(art) => handleSelectArticle(art, art.category)}
          selectedLanguage={selectedLanguage}
        />
      )}

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
            {selectedDate !== 'today'
              ? getUiTranslation(selectedLanguage, 'archivedNews', { date: selectedDate })
              : `${pageSubtitlePrefix} ${stateLabel}`}
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

        {/* Search Empty State */}
        {searchQuery && allFlatArticles.length === 0 && !loading && !error && (
          <div className="search-empty-state">
            <p>{getUiTranslation(selectedLanguage, 'searchEmpty', { query: searchQuery })}</p>
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="error-retry-btn"
              style={{ marginTop: '1rem' }}
            >
              {getUiTranslation(selectedLanguage, 'clearSearchFilter') || 'Clear Search Filter'}
            </button>
          </div>
        )}

        {/* News Categories (Filterable & Strictly Arranged by Time Published) */}
        {!loading && !error && (
          <>
            {(activeCategory === 'all'
              ? CATEGORIES
              : CATEGORIES.filter((c) => c.id === activeCategory)
            ).map((category) => (
              <CategorySection
                key={category.id}
                category={category}
                articles={filteredNewsData[category.id] || []}
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

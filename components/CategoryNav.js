'use client';

import { UI_TRANSLATIONS, getUiTranslation } from '@/lib/translations';
import MarketIndicator from './MarketIndicator';

import Link from 'next/link';

export default function CategoryNav({
  categories = [],
  activeCategory = 'all',
  onSelectCategory,
  categoryCounts = {},
  selectedLanguage = 'en',
}) {
  const allStoriesLabel = getUiTranslation(selectedLanguage, 'allStories') || 'All Stories';
  const categoriesNavAria = getUiTranslation(selectedLanguage, 'categoriesNav') || 'News Categories Navigation';
  const totalCount = categoryCounts.all || 0;

  return (
    <nav className="category-navbar" aria-label={categoriesNavAria}>
      <div className="category-navbar-container">
        {/* Scrollable tab row */}
        <div className="category-navbar-inner">
          <button
            type="button"
            className={`category-tab ${activeCategory === 'all' ? 'active' : ''}`}
            onClick={() => onSelectCategory('all')}
            aria-current={activeCategory === 'all' ? 'page' : undefined}
          >
            <span className="category-tab-label">{allStoriesLabel}</span>
            {totalCount > 0 && (
              <span className="category-tab-count">{totalCount}</span>
            )}
          </button>

          {categories.map((cat) => {
            const isActive = activeCategory === cat.id;
            const label =
              UI_TRANSLATIONS[selectedLanguage]?.categories?.[cat.id] ||
              UI_TRANSLATIONS.en?.categories?.[cat.id] ||
              cat.label;
            const count = categoryCounts[cat.id] || 0;

            return (
              <button
                key={cat.id}
                type="button"
                className={`category-tab ${isActive ? 'active' : ''} category-tab-${cat.id}`}
                onClick={() => onSelectCategory(cat.id)}
                aria-current={isActive ? 'page' : undefined}
              >
                <span className="category-tab-label">{label}</span>
                {count > 0 && (
                  <span className="category-tab-count">{count}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Market indicator lives here, clickable to open separate page */}
        <div className="category-navbar-market">
          <Link href="/market" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }} title="View full market details">
            <MarketIndicator />
          </Link>
        </div>
      </div>
    </nav>
  );
}

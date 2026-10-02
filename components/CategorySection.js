'use client';

import NewsCard from './NewsCard';
import { UI_TRANSLATIONS, getUiTranslation } from '@/lib/translations';

export default function CategorySection({
  category,
  articles = [],
  loading = false,
  selectedLanguage = 'en',
  onSelectArticle,
}) {
  const categoryLabel =
    UI_TRANSLATIONS[selectedLanguage]?.categories?.[category.id] ||
    UI_TRANSLATIONS.en?.categories?.[category.id] ||
    category.label;

  const emptyMessage = getUiTranslation(selectedLanguage, 'emptyStateMessage');
  const storyLabel = getUiTranslation(selectedLanguage, 'story') || 'Story';
  const storiesLabel = getUiTranslation(selectedLanguage, 'stories') || 'Stories';
  const count = articles ? articles.length : 0;

  return (
    <section className="category-section" id={`category-${category.id}`}>
      <div className="category-header-row">
        <div className="category-title-group">
          <span className="category-icon-badge" aria-hidden="true">
            {category.icon}
          </span>
          <h2 className="category-heading">{categoryLabel}</h2>
          {count > 0 && !loading && (
            <span className="category-count-pill">{count} {count === 1 ? storyLabel : storiesLabel}</span>
          )}
        </div>
        <div className="category-header-line" aria-hidden="true"></div>
      </div>

      {loading ? (
        <div className="news-grid">
          <div className="skeleton-card skeleton-card-lead"></div>
          <div className="skeleton-card"></div>
          <div className="skeleton-card"></div>
        </div>
      ) : articles && articles.length > 0 ? (
        <div className="news-layout-wrapper">
          {/* First article is featured as Lead Story */}
          <div className="news-lead-slot">
            <NewsCard
              key={`${articles[0].id || articles[0].link || 0}-${selectedLanguage}`}
              article={articles[0]}
              selectedLanguage={selectedLanguage}
              onSelectArticle={onSelectArticle}
              isLead={true}
            />
          </div>

          {/* Subsequent articles in a 2-column grid */}
          {articles.length > 1 && (
            <div className="news-secondary-grid">
              {articles.slice(1).map((article, index) => (
                <NewsCard
                  key={`${article.id || article.link || index + 1}-${selectedLanguage}`}
                  article={article}
                  selectedLanguage={selectedLanguage}
                  onSelectArticle={onSelectArticle}
                  isLead={false}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-state-icon" aria-hidden="true">🗞️</div>
          <p>{emptyMessage}</p>
        </div>
      )}
    </section>
  );
}

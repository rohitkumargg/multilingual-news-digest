import NewsCard from './NewsCard';
import { UI_TRANSLATIONS, getUiTranslation } from '@/lib/translations';

export default function CategorySection({ category, articles, loading, selectedLanguage = 'en' }) {
  const categoryLabel =
    UI_TRANSLATIONS[selectedLanguage]?.categories[category.id] ||
    category.label;

  const emptyMessage = getUiTranslation(selectedLanguage, 'emptyStateMessage');

  return (
    <section className="category-section" id={`category-${category.id}`}>
      <h2 className="category-heading">
        {category.icon && <span aria-hidden="true">{category.icon}</span>}
        {categoryLabel}
      </h2>

      {loading ? (
        <div className="news-grid">
          <div className="skeleton-card"></div>
          <div className="skeleton-card"></div>
          <div className="skeleton-card"></div>
        </div>
      ) : articles && articles.length > 0 ? (
        <div className="news-grid">
          {articles.map((article, index) => (
            <NewsCard
              key={`${article.id || article.link || index}`}
              article={article}
              selectedLanguage={selectedLanguage}
            />
          ))}
        </div>
      ) : (
        <div className="empty-state">{emptyMessage}</div>
      )}
    </section>
  );
}

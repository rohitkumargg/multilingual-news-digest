import MarketDashboard from '@/components/MarketDashboard';
import Link from 'next/link';

export const metadata = {
  title: 'Market Indices - Multilingual News Digest',
  description: 'Live stock market indices.',
};

export default function MarketPage() {
  return (
    <div className="market-page-wrapper">
      <header className="site-header market-site-header">
        <div className="brand" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <div className="brand-masthead-title" style={{ display: 'flex', alignItems: 'baseline', gap: '0.55rem' }}>
              <span className="brand-logo-text">MND</span>
              <span className="brand-paper-tag">MARKET</span>
            </div>
          </Link>
        </div>
        <Link href="/" className="back-to-news-link">
          &larr; Back to News
        </Link>
      </header>
      
      <main className="market-page-main">
        <h1 className="market-page-title">Live Market Indices</h1>
        <p className="market-page-desc">
          Real-time updates for key Indian indices. The dashboard automatically refreshes every 60 seconds.
        </p>
        
        <MarketDashboard />
      </main>
    </div>
  );
}

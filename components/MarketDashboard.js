'use client';

import { useState, useEffect, useCallback } from 'react';

const REFRESH_MS = 60_000; // refresh every 60 s

function fmt(value) {
  if (value == null) return '—';
  return value.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function fmtPct(value) {
  if (value == null) return '';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

export default function MarketDashboard() {
  const [quotes, setQuotes] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch('/api/market', { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to fetch market data');
      const data = await res.json();
      setQuotes(data);
      setLastUpdated(new Date());
    } catch (err) {
      setError('Could not load market data at this time.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="market-dashboard-loading">
        <div className="market-card-skeleton"></div>
        <div className="market-card-skeleton"></div>
        <div className="market-card-skeleton"></div>
      </div>
    );
  }

  if (error || !quotes) {
    return (
      <div className="market-dashboard-error">
        <p>{error || 'Something went wrong.'}</p>
        <button onClick={fetchData} className="retry-btn">Retry</button>
      </div>
    );
  }

  const marketState = quotes[0]?.marketState;
  const isClosed = marketState === 'CLOSED';

  return (
    <div className="market-dashboard">
      <div className="market-dashboard-header">
        <div className="market-status">
          <span className={`status-dot ${isClosed ? 'closed' : 'open'}`}></span>
          <span className="status-text">
            {isClosed ? 'Market Closed' : 'Market Open'}
          </span>
        </div>
        {lastUpdated && (
          <div className="market-updated-time">
            Last updated: {lastUpdated.toLocaleTimeString('en-IN')}
          </div>
        )}
      </div>

      <div className="market-grid">
        {quotes.map(q => {
          if (q.error || q.price == null) {
            return (
              <div key={q.id} className="market-card error">
                <div className="market-card-title">{q.label}</div>
                <div className="market-card-error">Data unavailable</div>
              </div>
            );
          }

          const isUp = (q.change ?? 0) >= 0;
          
          return (
            <div key={q.id} className={`market-card ${isUp ? 'up' : 'down'}`}>
              <div className="market-card-title">{q.label}</div>
              <div className="market-card-price">
                <span className="currency">₹</span>
                {fmt(q.price)}
              </div>
              <div className="market-card-change">
                <span className="change-abs">
                  {isUp ? '▲' : '▼'} {fmt(Math.abs(q.change))}
                </span>
                <span className="change-pct">
                  ({fmtPct(q.changePct)})
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

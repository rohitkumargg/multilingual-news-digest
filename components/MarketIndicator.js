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

export default function MarketIndicator() {
  const [quotes, setQuotes] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [pulse, setPulse] = useState(false); // flash on refresh

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/market', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      setQuotes(data);
      setLastUpdated(new Date());
      // flash
      setPulse(true);
      setTimeout(() => setPulse(false), 600);
    } catch {
      // silently fail — don't break the page
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (!quotes) {
    return (
      <div className="market-indicator market-indicator--loading">
        <span className="market-skeleton" />
        <span className="market-skeleton" />
        <span className="market-skeleton" />
      </div>
    );
  }

  const hasData = quotes.some(q => !q.error && q.price != null);
  if (!hasData) return null;

  const marketState = quotes[0]?.marketState;
  const isClosed = marketState === 'CLOSED';

  return (
    <div className={`market-indicator ${pulse ? 'market-indicator--pulse' : ''}`} aria-label="Live market indices">
      {/* Market status dot */}
      <span className={`market-status-dot ${isClosed ? 'market-status-dot--closed' : ''}`} title={isClosed ? 'Market Closed' : 'Market Open'} />

      <div className="market-quotes">
        {quotes.map(q => {
          if (q.error || q.price == null) return null;
          const up = (q.change ?? 0) >= 0;
          return (
            <div key={q.id} className="market-quote">
              <span className="market-quote__label">{q.label}</span>
              <span className="market-quote__price">{fmt(q.price)}</span>
              <span className={`market-quote__change ${up ? 'up' : 'down'}`}>
                {up ? '▲' : '▼'} {fmtPct(q.changePct)}
              </span>
            </div>
          );
        })}
      </div>

      {lastUpdated && (
        <time
          className="market-updated"
          dateTime={lastUpdated.toISOString()}
          title={`Last updated: ${lastUpdated.toLocaleTimeString('en-IN')}`}
        >
          {lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
        </time>
      )}
    </div>
  );
}

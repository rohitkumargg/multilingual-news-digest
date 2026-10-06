// Proxies Yahoo Finance's public JSON endpoint — no API key needed.
// Yahoo Finance rate-limits direct browser requests via CORS, so we fetch server-side.

const INDICES = [
  { id: 'nifty50',  symbol: '^NSEI',    label: 'NIFTY 50' },
  { id: 'sensex',   symbol: '^BSESN',   label: 'SENSEX' },
  { id: 'banknifty',symbol: '^NSEBANK', label: 'BANK NIFTY' },
];

async function fetchQuote(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d&includePrePost=false`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Accept: 'application/json',
    },
    next: { revalidate: 60 }, // ISR-style server cache for 60s
  });
  if (!res.ok) throw new Error(`Yahoo Finance returned ${res.status} for ${symbol}`);
  const data = await res.json();
  const meta = data?.chart?.result?.[0]?.meta;
  if (!meta) throw new Error(`No meta for ${symbol}`);
  return {
    price:         meta.regularMarketPrice ?? null,
    change:        meta.regularMarketChange ?? null,
    changePct:     meta.regularMarketChangePercent ?? null,
    previousClose: meta.chartPreviousClose ?? meta.regularMarketPreviousClose ?? null,
    currency:      meta.currency ?? 'INR',
    marketState:   meta.marketState ?? 'UNKNOWN', // 'REGULAR' | 'CLOSED' | 'PRE' | 'POST'
  };
}

export async function GET() {
  const results = await Promise.allSettled(INDICES.map(idx => fetchQuote(idx.symbol)));

  const payload = INDICES.map((idx, i) => {
    const r = results[i];
    if (r.status === 'fulfilled') {
      return { ...idx, ...r.value, error: false };
    }
    return { ...idx, error: true };
  });

  return Response.json(payload, {
    headers: {
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30',
    },
  });
}

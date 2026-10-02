/**
 * MND — Google Translate Pronunciation / Text-to-Speech (TTS) API Route
 * Supports GET & POST /api/tts
 *
 * Uses official Google Translate Pronunciation engine with:
 * - Natural text cleaning & HTML entity sanitization
 * - Natural clause splitting (<170 chars per chunk)
 * - Google Translate Pronunciation endpoints (tw-ob / gtx) with parameters
 * - Concatenation of MP3 audio frames for seamless, high-fidelity speech
 * - In-memory LRU audio caching
 */

import { NextResponse } from 'next/server';

// In-memory cache for generated TTS audio buffers (TTL: 12 hours)
const ttsCache = new Map();
const TTS_CACHE_TTL = 12 * 60 * 60 * 1000;

/**
 * Clean text for natural speech pronunciation:
 * Removes HTML tags, resolves common HTML entities, normalizes whitespace.
 */
function cleanSpeechText(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, ' and ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&ndash;|&mdash;/g, ' - ')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Split text into natural sentence / clause chunks under maxLen (170 chars)
 */
function splitIntoChunks(text, maxLen = 170) {
  if (!text || text.length <= maxLen) return [text];

  const chunks = [];
  // Split by sentence delimiters first (. ! ? । | \n)
  const sentences = text.match(/[^.!?।|\n]+[.!?।|\n]+|[^.!?।|\n]+$/g) || [text];

  let currentChunk = '';
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;

    if (trimmed.length > maxLen) {
      // Split very long sentence by commas or words
      const words = trimmed.split(/\s+/);
      for (const word of words) {
        if ((currentChunk + ' ' + word).trim().length > maxLen) {
          if (currentChunk.trim()) chunks.push(currentChunk.trim());
          currentChunk = word;
        } else {
          currentChunk = (currentChunk + ' ' + word).trim();
        }
      }
    } else if ((currentChunk + ' ' + trimmed).length > maxLen) {
      if (currentChunk.trim()) chunks.push(currentChunk.trim());
      currentChunk = trimmed;
    } else {
      currentChunk = currentChunk ? `${currentChunk} ${trimmed}` : trimmed;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks.length > 0 ? chunks : [text.slice(0, maxLen)];
}

// Map app language code to supported Google TTS language code
const GOOGLE_TTS_LANG_MAP = {
  en: 'en',
  hi: 'hi',
  bn: 'bn',
  te: 'te',
  mr: 'mr',
  ta: 'ta',
  gu: 'gu',
  kn: 'kn',
  ml: 'ml',
  pa: 'pa',
  or: 'hi', // Odia TTS fallback to Hindi pronunciation if unmapped
  as: 'bn', // Assamese TTS fallback to Bengali phonetics if unmapped
};

/**
 * Fetch a single audio chunk from Google Translate TTS with client fallback.
 */
async function fetchGoogleTtsChunk(chunk, ttsLang) {
  const clients = ['tw-ob', 'gtx'];
  const encodedChunk = encodeURIComponent(chunk);

  for (const client of clients) {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=${client}&tl=${encodeURIComponent(
      ttsLang
    )}&ttsspeed=1&total=1&idx=0&textlen=${chunk.length}&q=${encodedChunk}`;

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Referer: 'https://translate.google.com/',
        },
        signal: AbortSignal.timeout(5000),
      });

      if (res.ok) {
        const arrayBuf = await res.arrayBuffer();
        if (arrayBuf.byteLength > 0) {
          return Buffer.from(arrayBuf);
        }
      }
    } catch {
      // Try next client
    }
  }

  return null;
}

/**
 * Core handler for generating Google Translate Pronunciation audio
 */
async function handleTtsRequest(rawText, rawLang) {
  const cleaned = cleanSpeechText(rawText).slice(0, 1200);
  if (!cleaned) {
    return NextResponse.json({ error: 'Text query parameter is required' }, { status: 400 });
  }

  const ttsLang = GOOGLE_TTS_LANG_MAP[rawLang] || 'en';
  const cacheKey = `${ttsLang}:${cleaned}`;

  // Check memory cache
  const cached = ttsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < TTS_CACHE_TTL) {
    return new Response(cached.buffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=43200, s-maxage=43200',
      },
    });
  }

  // Split text into Google Translate accepted chunks (<170 chars)
  const chunks = splitIntoChunks(cleaned, 160).slice(0, 8);

  const audioBuffers = [];
  for (const chunk of chunks) {
    const buf = await fetchGoogleTtsChunk(chunk, ttsLang);
    if (buf) {
      audioBuffers.push(buf);
    }
  }

  if (audioBuffers.length === 0) {
    return NextResponse.json({ error: 'Failed to generate audio from Google Pronunciation API' }, { status: 502 });
  }

  const combinedBuffer = Buffer.concat(audioBuffers);

  // Save in cache
  ttsCache.set(cacheKey, {
    buffer: combinedBuffer,
    timestamp: Date.now(),
  });

  // LRU cleanup if cache exceeds 300 items
  if (ttsCache.size > 300) {
    const oldestKey = ttsCache.keys().next().value;
    if (oldestKey) ttsCache.delete(oldestKey);
  }

  return new Response(combinedBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'public, max-age=43200, s-maxage=43200',
    },
  });
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawText = searchParams.get('text') || '';
    const rawLang = searchParams.get('lang') || 'en';
    return await handleTtsRequest(rawText, rawLang);
  } catch (error) {
    console.error('[Google TTS GET Error]:', error);
    return NextResponse.json({ error: 'Internal server error while processing speech' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const rawText = body.text || '';
    const rawLang = body.lang || 'en';
    return await handleTtsRequest(rawText, rawLang);
  } catch (error) {
    console.error('[Google TTS POST Error]:', error);
    return NextResponse.json({ error: 'Internal server error while processing speech' }, { status: 500 });
  }
}

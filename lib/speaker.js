'use client';

/**
 * MND — Google Translate Pronunciation Audio Player
 *
 * Streams authentic native pronunciation from Google Translate's TTS engine
 * via the server-side /api/tts endpoint (using POST with blob audio streaming).
 * Handles user interruption, memory cleanup, and browser speech fallback.
 */

let currentAudio = null;
let currentBlobUrl = null;
let currentAbortController = null;
let currentOnStop = null;

/**
 * Immediately stops any playing speech, cancels in-flight requests,
 * and releases audio resources.
 */
export function stopSpeech() {
  if (currentAbortController) {
    try {
      currentAbortController.abort();
    } catch {
      // Ignore abort errors
    }
    currentAbortController = null;
  }

  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    } catch {
      // Ignore pause error
    }
    currentAudio = null;
  }

  if (currentBlobUrl) {
    try {
      URL.revokeObjectURL(currentBlobUrl);
    } catch {
      // Ignore revoke error
    }
    currentBlobUrl = null;
  }

  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // Ignore cancel error
    }
  }

  if (currentOnStop) {
    const cb = currentOnStop;
    currentOnStop = null;
    cb();
  }
}

/**
 * Play text pronunciation using Google Translate Pronunciation API.
 *
 * @param {Object} options
 * @param {string} options.text - Text to speak
 * @param {string} options.lang - Language code (e.g. 'en', 'hi', 'te', etc.)
 * @param {Function} [options.onStart] - Callback when speech starts
 * @param {Function} [options.onEnd] - Callback when speech finishes or is stopped
 * @param {Function} [options.onError] - Callback on failure
 */
export function playSpeech({ text, lang = 'en', onStart, onEnd, onError }) {
  stopSpeech();

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    if (onError) onError(new Error('No text to speak'));
    return;
  }

  const cleanText = text.replace(/<[^>]*>/g, '').trim().slice(0, 1200);

  const controller = new AbortController();
  currentAbortController = controller;

  let stopped = false;
  currentOnStop = () => {
    stopped = true;
    if (onEnd) onEnd();
  };

  // 1. Fetch MP3 audio from Google Translate Pronunciation endpoint via POST
  fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: cleanText, lang }),
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) {
        throw new Error(`Google Pronunciation API returned HTTP ${res.status}`);
      }
      return await res.blob();
    })
    .then((blob) => {
      if (stopped) return;

      const blobUrl = URL.createObjectURL(blob);
      currentBlobUrl = blobUrl;

      const audio = new Audio(blobUrl);
      currentAudio = audio;

      audio.onplay = () => {
        if (onStart) onStart();
      };

      audio.onended = () => {
        if (currentBlobUrl) {
          URL.revokeObjectURL(currentBlobUrl);
          currentBlobUrl = null;
        }
        currentAudio = null;
        currentOnStop = null;
        currentAbortController = null;
        if (onEnd) onEnd();
      };

      audio.onerror = () => {
        fallbackToSpeechSynthesis(cleanText, lang, onStart, onEnd, onError);
      };

      audio.play().catch((playErr) => {
        if (stopped) return;
        console.warn('[Audio play rejected, using fallback]:', playErr.message);
        fallbackToSpeechSynthesis(cleanText, lang, onStart, onEnd, onError);
      });
    })
    .catch((err) => {
      if (stopped || err.name === 'AbortError') return;
      console.warn('[Google TTS request failed, using browser fallback]:', err.message);
      fallbackToSpeechSynthesis(cleanText, lang, onStart, onEnd, onError);
    });
}

/**
 * Graceful fallback to browser Web Speech API
 */
function fallbackToSpeechSynthesis(text, lang, onStart, onEnd, onError) {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang === 'en' ? 'en-IN' : `${lang}-IN`;

      utterance.onstart = () => {
        if (onStart) onStart();
      };

      utterance.onend = () => {
        currentAudio = null;
        currentOnStop = null;
        currentAbortController = null;
        if (onEnd) onEnd();
      };

      utterance.onerror = (e) => {
        currentAudio = null;
        currentOnStop = null;
        currentAbortController = null;
        if (onEnd) onEnd();
        if (onError) onError(e);
      };

      window.speechSynthesis.speak(utterance);
      return;
    } catch {
      // Speech synthesis not available
    }
  }

  currentAudio = null;
  currentOnStop = null;
  currentAbortController = null;
  if (onEnd) onEnd();
  if (onError) onError(new Error('Speech unavailable'));
}

/**
 * Wake-Word Engine — Architecture & Picovoice Porcupine Configuration
 * ─────────────────────────────────────────────────────────────────────
 *
 * The "Ball" AI Voice Assistant uses a two-phase pipeline:
 *   Phase 1 – Wake-word detection  ("Hey Ball")
 *   Phase 2 – Command recognition  (Web Speech API, language: en-IN)
 *
 * By default, Phase 1 runs on the Web Speech API (no credentials needed).
 * Upgrade Phase 1 to Picovoice Porcupine for <50 ms, always-on, offline
 * wake-word detection identical to Samsung Bixby.
 *
 * ══════════════════════════════════════════════════════════════════════
 *  HOW TO ENABLE PICOVOICE PORCUPINE
 * ══════════════════════════════════════════════════════════════════════
 *
 *  1. Create a free account at https://console.picovoice.ai
 *     Copy your Access Key from the dashboard.
 *
 *  2. Paste it into PICOVOICE_ACCESS_KEY below.
 *
 *  3. Train a custom "Hey Ball" wake-word model:
 *       → Visit https://console.picovoice.ai/ppn
 *       → Platform: "Web / Browser (WASM)"
 *       → Wake phrase: "Hey Ball"
 *       → Download the .ppn file
 *
 *  4. Place the .ppn file in:
 *       artifacts/cricket-dashboard/public/hey-ball.ppn
 *     (or update PICOVOICE_WAKE_MODEL_PATH below to match your filename)
 *
 *  5. Install the SDK:
 *       pnpm add --filter @workspace/cricket-dashboard @picovoice/porcupine-web
 *
 *  6. In VoiceAssistant.tsx the comment block marked
 *     "── PORCUPINE INTEGRATION ──" shows the exact hook to uncomment.
 *     When PICOVOICE_ACCESS_KEY is non-empty, VoiceAssistant automatically
 *     switches from Web Speech wake-word to Porcupine — no other changes needed.
 *
 * ══════════════════════════════════════════════════════════════════════
 */

// ── Step 2: paste your Access Key here ──────────────────────────────────────
export const PICOVOICE_ACCESS_KEY = '';

// ── Step 4: path to your .ppn wake-word model (inside /public/) ─────────────
export const PICOVOICE_WAKE_MODEL_PATH = '/hey-ball.ppn';

/** Returns true only when both credentials are configured. */
export function isPorcupineConfigured(): boolean {
  return PICOVOICE_ACCESS_KEY.trim().length > 0 &&
         PICOVOICE_WAKE_MODEL_PATH.trim().length > 0;
}

/**
 * Command-recognition language preference.
 * 'en-IN' gives the best results for Indian English.
 * Falls back gracefully on browsers that don't support it.
 */
export const COMMAND_LANG = 'en-IN';

/**
 * Wake-word strings used by the Web-Speech-API fallback detector.
 * These cover common mishearings of "Hey Ball" in Indian English accents.
 */
export const WAKE_WORDS: readonly string[] = [
  // Primary forms
  'hey ball', 'hi ball', 'hello ball',
  'okay ball', 'ok ball', 'yo ball',
  'wake up ball', 'ball please', 'ball help',
  // Phonetic mishearings — "hey" variants
  'hey bo', 'hey bawl', 'a ball', 'hey paul',
  'hey bol', 'hey bowl',
  // Additional phonetic mishearings for Indian English
  'hey boll', 'hey bool', 'hey baal', 'hey bal',
  'a bol', 'a boll', 'a baal', 'a bol',
  'hai ball', 'hai bol', 'hei ball', 'hei bol',
  'hay ball', 'hay bol',
  'heyball', 'hiball', 'heybol',
  // "ball" alone as a strong trigger
  'hey bol please', 'ok bol',
] as const;

/**
 * Phonetic regex patterns that match "hey/hi/ok + ball" sound-alikes.
 *
 * Captures:
 *  - Trigger words: hey, hi, hai, hei, hay, a, okay, ok, yo, wake up, hello
 *  - Ball variants: ball, bol, bawl, boll, bool, baal, bal, paul, pol, bowl, bol
 */
const WAKE_REGEX = /\b(hey|hi|hai|hei|hay|hello|okay|ok|yo|a|wake\s*up)\s+(b[ao][wl]?l?|b[ou][ol][l]?|baal|paul|pol|bol[l]?|bowl[l]?)\b/i;

/**
 * Levenshtein distance between two strings (capped at maxDist for speed).
 */
function levenshtein(a: string, b: string, maxDist = 2): number {
  if (Math.abs(a.length - b.length) > maxDist) return maxDist + 1;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const curr = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    prev.splice(0, prev.length, ...curr);
  }
  return prev[b.length];
}

/**
 * Core wake-word detector.
 *
 * Returns true when the transcribed text contains any recognised form of
 * "Hey Ball", using three complementary strategies:
 *
 *  1. Exact substring match against WAKE_WORDS list.
 *  2. Phonetic regex that captures accent-driven mishearings.
 *  3. Fuzzy edit-distance check: splits text into bigrams (pairs of
 *     consecutive words) and accepts any pair within edit distance 1
 *     of a known wake phrase.
 *
 * Designed to be fast enough for every interim speech result.
 */
export function detectWakeWord(text: string): boolean {
  const t = text.toLowerCase().trim();
  if (!t) return false;

  // ── Strategy 1: exact substring match ──────────────────────────────────────
  if (WAKE_WORDS.some(w => t.includes(w))) return true;

  // ── Strategy 2: phonetic regex ─────────────────────────────────────────────
  if (WAKE_REGEX.test(t)) return true;

  // ── Strategy 3: fuzzy bigram match ─────────────────────────────────────────
  // Split into words and test consecutive pairs against known two-word phrases.
  const words = t.split(/\s+/);
  const corePhrase = 'hey ball'; // canonical target for bigram fuzzy check

  for (let i = 0; i < words.length - 1; i++) {
    const bigram = words[i] + ' ' + words[i + 1];
    if (levenshtein(bigram, corePhrase, 2) <= 2) return true;
    // Also test against a few common two-word variants
    if (levenshtein(bigram, 'hi ball',    2) <= 1) return true;
    if (levenshtein(bigram, 'ok ball',    2) <= 1) return true;
    if (levenshtein(bigram, 'hey bol',    2) <= 1) return true;
  }

  // ── Strategy 4: standalone "ball" with a short preceding utterance ──────────
  // Catches cases where speech recognition collapses "hey" into silence but
  // still transcribes "ball" clearly.
  if (/\bball\b/.test(t) && t.split(/\s+/).length <= 2) return true;

  return false;
}

/**
 * Strip all wake-word forms from a transcript so only the command remains.
 * Uses both the WAKE_WORDS list and the phonetic regex.
 */
export function stripWakeWord(text: string): string {
  let t = text.toLowerCase().trim();
  // Remove exact substrings
  t = WAKE_WORDS.reduce((s, w) => s.replace(w, ''), t);
  // Remove phonetic matches
  t = t.replace(WAKE_REGEX, '');
  return t.trim();
}

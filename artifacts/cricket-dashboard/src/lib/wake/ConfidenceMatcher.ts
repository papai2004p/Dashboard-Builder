/**
 * ConfidenceMatcher.ts
 *
 * Scores a speech transcript against the "Hey Ball" wake phrase using
 * multiple complementary strategies with weighted confidence scoring.
 *
 * Strategy priority (highest → lowest confidence):
 *  1. Exact primary phrase    → 100
 *  2. Phonetic variant list   →  92
 *  3. Phonetic regex          →  91
 *  4. Standalone "ball"       →  88
 *  5. Phonetic normalization  →  87
 *  6. Levenshtein bigram      →  76-86
 *  7. Jaro-Winkler similarity →  threshold-scaled
 *
 * Each matched result may receive a +5 position bonus when the wake phrase
 * appears at the START of the utterance (common in natural speech).
 *
 * Optimised for Indian English pronunciation variations.
 */

// Primary wake phrases — canonical, ordered by specificity
const PRIMARY_PHRASES = [
  'hey ball', 'hi ball', 'hello ball',
  'okay ball', 'ok ball', 'yo ball',
  'hey cricket ball', 'hi cricket ball',
  'ball assistant', 'ball please', 'hey buddy',
  'wake up ball',
] as const;

// Phonetic variants covering Indian English accent mishearings
const PHONETIC_VARIANTS = [
  // hay / hay-b variants
  'hay ball', 'hay bol',
  // hey bXXX variants
  'hey bawl', 'hey bowl', 'hey baal', 'hey bal', 'hey bol', 'hey boll', 'hey bool',
  // hai / hei variants
  'hai ball', 'hai bol', 'hei ball', 'hei bol',
  // a-ball variants (aspiration drop)
  'a ball', 'a bol', 'a boll', 'a baal',
  // fused no-space variants (fast/slurred speech)
  'heyball', 'hiball', 'heybol', 'okball',
  'heybal', 'haybal', 'hibal',         // single-l fused variants
  // ok variants
  'ok bol', 'okay bol',
] as const;

// Phonetic regex — captures accent-driven mishearings in a single pass
export const WAKE_REGEX =
  /\b(hey|hi|hai|hei|hay|hello|okay|ok|yo|a|wake\s*up|aye)\s+(b[ao][wl]?l?|b[ou][ol][l]?|baal?|paul|pol|bol[l]?|bowl[l]?|boll|bool|bal)\b/i;

// Pattern for bare "ball" as a standalone utterance (≤ 2 words total)
const STANDALONE_BALL = /^\s*(hey\s+)?ball\s*[.!?]?\s*$/i;

// --- Internal helpers -------------------------------------------------------

/** Levenshtein edit distance (capped at maxDist for performance). */
function levenshtein(a: string, b: string, maxDist = 3): number {
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
 * Jaro-Winkler similarity (0–1).
 * Fast, suitable for short word pairs.
 */
function jaroWinkler(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  const len1 = s1.length, len2 = s2.length;
  const matchDist = Math.max(Math.floor(Math.max(len1, len2) / 2) - 1, 0);
  const s1m = new Array<boolean>(len1).fill(false);
  const s2m = new Array<boolean>(len2).fill(false);
  let matches = 0;
  for (let i = 0; i < len1; i++) {
    const lo = Math.max(0, i - matchDist);
    const hi = Math.min(i + matchDist + 1, len2);
    for (let j = lo; j < hi; j++) {
      if (s2m[j] || s1[i] !== s2[j]) continue;
      s1m[i] = s2m[j] = true;
      matches++;
      break;
    }
  }
  if (!matches) return 0;
  let k = 0, t = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1m[i]) continue;
    while (!s2m[k]) k++;
    if (s1[i] !== s2[k]) t++;
    k++;
  }
  const jaro = (matches / len1 + matches / len2 + (matches - t / 2) / matches) / 3;
  let prefix = 0;
  for (let i = 0; i < Math.min(4, Math.min(len1, len2)); i++) {
    if (s1[i] !== s2[i]) break;
    prefix++;
  }
  return jaro + prefix * 0.1 * (1 - jaro);
}

/**
 * Phonetic normalizer — collapses common Indian English sound-alikes so
 * the text can be matched against canonical phrases.
 */
function phoneticNormalize(word: string): string {
  return word
    .replace(/^(ai|ei|ay|hai|hei|hay)\b/g, 'hey')
    .replace(/\b(bawl|baal|bowl|bool|boll|bol)\b/g, 'ball')
    .replace(/\bpaul\b/g, 'ball')
    .replace(/\bpol\b/g, 'ball')
    .replace(/ph/g, 'f');
}

/**
 * Returns true if the text begins with a wake phrase
 * (first 3 words contain a match).
 */
function startsWithWakePhrase(text: string): boolean {
  const prefix = text.split(/\s+/).slice(0, 3).join(' ');
  if (WAKE_REGEX.test(prefix)) return true;
  for (const phrase of PRIMARY_PHRASES) {
    if (prefix.startsWith(phrase)) return true;
  }
  for (const phrase of PHONETIC_VARIANTS) {
    if (prefix.startsWith(phrase)) return true;
  }
  return false;
}

// --- Public API ------------------------------------------------------------

export interface MatchResult {
  matched: boolean;
  confidence: number;     // 0–100
  strategy: string;       // which internal strategy triggered
  matchedPhrase?: string; // the phrase that was recognised
}

/**
 * Scores a speech transcript against the "Hey Ball" wake phrase.
 * Configurable confidence threshold; all strategies above the threshold
 * return matched = true.
 */
export class ConfidenceMatcher {
  private threshold: number;
  private readonly fuzzyTargets = ['hey ball', 'hi ball', 'ok ball', 'hey bol', 'hey bal'];

  constructor(threshold = 85) {
    this.threshold = threshold;
  }

  setThreshold(t: number): void {
    this.threshold = Math.max(0, Math.min(100, t));
  }
  getThreshold(): number { return this.threshold; }

  /**
   * Score the transcript and return a MatchResult.
   * Call `.matched` to decide whether to wake the assistant.
   */
  score(rawText: string): MatchResult {
    const result = this._scoreInternal(rawText);
    if (result.matched) {
      // Position bonus +5: wake phrase at the start of utterance
      const text = rawText.toLowerCase().trim();
      if (startsWithWakePhrase(text)) {
        return { ...result, confidence: Math.min(100, result.confidence + 5) };
      }
    }
    return result;
  }

  /** Internal scoring — strategies in confidence order. */
  private _scoreInternal(rawText: string): MatchResult {
    const text = rawText.toLowerCase().trim();
    if (!text) return { matched: false, confidence: 0, strategy: 'empty' };

    // ── 1. Exact primary phrase ──────────────────────────────────────
    for (const phrase of PRIMARY_PHRASES) {
      if (text.includes(phrase)) {
        return { matched: true, confidence: 100, strategy: 'exact-primary', matchedPhrase: phrase };
      }
    }

    // ── 2. Phonetic variants ─────────────────────────────────────────
    for (const phrase of PHONETIC_VARIANTS) {
      if (text.includes(phrase)) {
        return { matched: true, confidence: 92, strategy: 'phonetic-variant', matchedPhrase: phrase };
      }
    }

    // ── 3. Phonetic regex ────────────────────────────────────────────
    if (WAKE_REGEX.test(text)) {
      return { matched: true, confidence: 91, strategy: 'phonetic-regex' };
    }

    // ── 4. Standalone "ball" ─────────────────────────────────────────
    if (STANDALONE_BALL.test(text)) {
      return { matched: true, confidence: 88, strategy: 'standalone-ball' };
    }

    // ── 5. Phonetic normalization then re-match ───────────────────────
    const normalized = text.split(/\s+/).map(phoneticNormalize).join(' ');
    if (normalized !== text) {
      for (const phrase of PRIMARY_PHRASES) {
        if (normalized.includes(phrase)) {
          return { matched: true, confidence: 87, strategy: 'phonetic-normalized', matchedPhrase: phrase };
        }
      }
      if (WAKE_REGEX.test(normalized)) {
        return { matched: true, confidence: 85, strategy: 'phonetic-normalized-regex' };
      }
    }

    // ── 6. Levenshtein bigram fuzzy match ────────────────────────────
    const words = text.split(/\s+/);
    for (let i = 0; i < words.length - 1; i++) {
      const bigram = `${words[i]} ${words[i + 1]}`;
      for (const target of this.fuzzyTargets) {
        const dist = levenshtein(bigram, target, 2);
        if (dist <= 1) {
          const conf = 86 - dist * 5;
          return { matched: conf >= this.threshold, confidence: conf, strategy: 'fuzzy-bigram', matchedPhrase: target };
        }
        if (dist === 2) {
          return { matched: 76 >= this.threshold, confidence: 76, strategy: 'fuzzy-bigram-2', matchedPhrase: target };
        }
      }
    }

    // ── 7. Jaro-Winkler token similarity ─────────────────────────────
    let bestSim = 0;
    let bestTarget = '';
    for (let i = 0; i < words.length - 1; i++) {
      const bigram = `${words[i]} ${words[i + 1]}`;
      for (const target of this.fuzzyTargets) {
        const sim = jaroWinkler(bigram, target);
        if (sim > bestSim) { bestSim = sim; bestTarget = target; }
      }
    }
    if (bestSim >= 0.88) {
      const confidence = Math.round(bestSim * 82);
      return {
        matched: confidence >= this.threshold,
        confidence,
        strategy: 'jaro-winkler',
        matchedPhrase: bestTarget,
      };
    }

    return { matched: false, confidence: Math.round(bestSim * 65), strategy: 'no-match' };
  }
}

// --- Backward-compatible helpers -------------------------------------------

const _globalMatcher = new ConfidenceMatcher(85);

/** Detect a wake word in text (backward-compatible helper). */
export function detectWakeWord(text: string): boolean {
  return _globalMatcher.score(text).matched;
}

/**
 * Strip all wake-word forms from a transcript so only the command remains.
 */
export function stripWakeWord(text: string): string {
  let t = text.toLowerCase().trim();
  const allPhrases = [...PRIMARY_PHRASES, ...PHONETIC_VARIANTS];
  for (const phrase of allPhrases) {
    t = t.replace(new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '');
  }
  t = t.replace(WAKE_REGEX, '');
  return t.trim();
}

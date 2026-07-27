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
 * These cover common mishearings of "Hey Ball" in Indian accents.
 */
export const WAKE_WORDS: readonly string[] = [
  'hey ball', 'hi ball', 'hello ball',
  'okay ball', 'ok ball', 'yo ball',
  'wake up ball', 'ball please', 'ball help',
  // common mishearings
  'hey bo', 'hey bawl', 'a ball', 'hey paul',
  'hey bol', 'hey bowl',
] as const;

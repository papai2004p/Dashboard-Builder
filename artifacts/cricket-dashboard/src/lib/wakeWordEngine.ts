/**
 * wakeWordEngine.ts  —  Central exports for the "Hey Ball" custom engine.
 *
 * The engine is implemented as a set of focused modules in src/lib/wake/:
 *
 *   WakeWordEngine      — main orchestrator (the ONLY interface VoiceAssistant
 *                         needs to talk to)
 *   ConfidenceMatcher   — multi-strategy scoring (exact, phonetic, fuzzy,
 *                         Jaro-Winkler, Levenshtein)
 *   VoiceActivityDetector — Web Audio API speech/silence detection
 *   SpeakerTracker      — prevents simultaneous / rapid-repeat triggers
 *   RecognitionManager  — Web Speech API lifecycle with auto-restart
 *
 * ── Future-compatibility ─────────────────────────────────────────────────────
 * To replace the custom engine with Picovoice, OpenWakeWord, or any other SDK:
 *   1. Swap the implementation inside src/lib/wake/WakeWordEngine.ts.
 *   2. Keep the same public interface (start/stop/processTranscript/
 *      setAssistantSpeaking/releaseLock/onWakeWord).
 *   3. VoiceAssistant.tsx and every other consumer remain unchanged.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── New modular engine (primary interface) ─────────────────────────────────
export { WakeWordEngine }                     from './wake/WakeWordEngine';
export type { WakeWordEngineStatus,
              WakeWordEngineOptions,
              MatchResult }                   from './wake/WakeWordEngine';

export { ConfidenceMatcher }                  from './wake/ConfidenceMatcher';
export { VoiceActivityDetector }              from './wake/VoiceActivityDetector';
export type { VADOptions }                    from './wake/VoiceActivityDetector';
export { SpeakerTracker }                     from './wake/SpeakerTracker';
export type { SpeakerTrackerOptions }         from './wake/SpeakerTracker';
export { RecognitionManager }                 from './wake/RecognitionManager';
export type { RecognitionManagerOptions,
              RecognitionResult }             from './wake/RecognitionManager';

// ── Backward-compatible exports (keep VoiceAssistant working unchanged) ────
import { ConfidenceMatcher as _CM, WAKE_REGEX, stripWakeWord as _strip }
  from './wake/ConfidenceMatcher';

/** Command-recognition language — Indian English gives best accent results. */
export const COMMAND_LANG = 'en-IN';

/** Canonical wake-word strings (used for display and reference). */
export const WAKE_WORDS: readonly string[] = [
  'hey ball', 'hi ball', 'hello ball',
  'okay ball', 'ok ball', 'yo ball',
  'hey cricket ball', 'hi cricket ball',
  'hay ball', 'hey bawl', 'hey bowl', 'hey bol',
  'hai ball', 'hei ball', 'a ball',
  'wake up ball', 'ball',
] as const;

/**
 * Always returns false — Picovoice is not configured.
 * The custom engine (ConfidenceMatcher) is active.
 * Set up Picovoice integration by replacing WakeWordEngine.ts.
 */
export function isPorcupineConfigured(): boolean {
  return false;
}

// Module-level matcher singleton for the backward-compat helpers
const _matcher = new _CM(85);

/**
 * Detect a wake phrase in `text`.
 * Backward-compatible wrapper around ConfidenceMatcher.score().
 */
export function detectWakeWord(text: string): boolean {
  return _matcher.score(text).matched;
}

/**
 * Strip all wake-word forms from a transcript so only the command remains.
 */
export { _strip as stripWakeWord };
export { WAKE_REGEX };

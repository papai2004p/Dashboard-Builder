/**
 * WakeWordEngine.ts
 *
 * Main orchestrator for the custom "Hey Ball" wake-word engine.
 *
 * Architecture:
 *
 *   Continuous SpeechRecognition (RecognitionManager)
 *         │  transcript text
 *         ▼
 *   ConfidenceMatcher  ──  multi-strategy scoring (exact, phonetic,
 *         │                fuzzy, Jaro-Winkler, Levenshtein)
 *         │  confidence score 0-100
 *         ▼
 *   SpeakerTracker  ──  prevents simultaneous / rapid-repeat triggers
 *         │  lock acquired
 *         ▼
 *   onWakeWord(confidence) callback  →  VoiceAssistant activates
 *
 *   VoiceActivityDetector runs in parallel on the raw audio stream
 *   and gates recognition: transcripts are ignored during silence.
 *
 * Future-compatible: swap only this file (and its imports) to replace
 * the custom engine with Picovoice, OpenWakeWord, or any other engine.
 * VoiceAssistant.tsx remains unchanged.
 */

import { ConfidenceMatcher } from './ConfidenceMatcher';
import type { MatchResult }  from './ConfidenceMatcher';
import { SpeakerTracker }    from './SpeakerTracker';

export type { MatchResult };

export type WakeWordEngineStatus =
  | 'idle'        // not yet started
  | 'listening'   // actively waiting for wake phrase
  | 'paused'      // muted — assistant is speaking; self-trigger prevention
  | 'locked'      // speaker lock active — command session in progress
  | 'error'       // non-recoverable error
  | 'unsupported' // browser missing required APIs
  ;

export interface WakeWordEngineOptions {
  /** Confidence threshold 0–100. Default: 85 */
  threshold?: number;
  /** Speaker lock auto-release timeout ms. Default: 8 000 */
  speakerLockMs?: number;
}

export class WakeWordEngine {
  private readonly matcher:        ConfidenceMatcher;
  private readonly speakerTracker: SpeakerTracker;

  private status:           WakeWordEngineStatus = 'idle';
  private assistantSpeaking = false;
  private started           = false;

  // --- Public callbacks (assign before calling start()) -------------------

  /** Called when the wake phrase is detected. `confidence` is 0–100. */
  onWakeWord?: (confidence: number, result: MatchResult) => void;

  /** Called whenever the engine's status changes. */
  onStatusChange?: (status: WakeWordEngineStatus) => void;

  // ------------------------------------------------------------------------

  constructor(options: WakeWordEngineOptions = {}) {
    this.matcher = new ConfidenceMatcher(options.threshold ?? 85);

    this.speakerTracker = new SpeakerTracker({
      lockTimeoutMs:    options.speakerLockMs ?? 8_000,
      releaseDebounceMs: 1_500,
    });

    // When the lock releases, restore the listening status automatically
    this.speakerTracker.onRelease = () => {
      if (this.started && !this.assistantSpeaking) {
        this._setStatus('listening');
      }
    };
  }

  // --- Lifecycle -----------------------------------------------------------

  /** Mark the engine as active. Call once on VoiceAssistant mount. */
  start(): void {
    this.started = true;
    this._setStatus('listening');
  }

  /** Shut down the engine. Releases all locks and timers. */
  stop(): void {
    this.started = false;
    this.speakerTracker.release();
    this.speakerTracker.destroy();
    this._setStatus('idle');
  }

  // --- Speaker state -------------------------------------------------------

  /**
   * Notify the engine that the assistant has started or stopped speaking (TTS).
   * While `speaking = true` all transcripts are ignored — preventing the engine
   * from triggering on the assistant's own voice.
   */
  setAssistantSpeaking(speaking: boolean): void {
    this.assistantSpeaking = speaking;
    if (speaking) {
      this._setStatus('paused');
    } else if (this.started && !this.speakerTracker.isBlocked()) {
      this._setStatus('listening');
    }
  }

  // --- Core detection ------------------------------------------------------

  /**
   * Feed a speech-recognition transcript into the engine.
   *
   * Called by VoiceAssistant's `onresult` handler for every interim / final
   * result (replaces the old `detectWakeWord(text)` call).
   *
   * Returns the full MatchResult so VoiceAssistant can log the confidence
   * score if desired. Use `.matched` to decide whether to activate.
   */
  processTranscript(text: string): MatchResult {
    // Block while assistant is speaking or speaker lock is active
    if (this.assistantSpeaking) {
      return { matched: false, confidence: 0, strategy: 'muted-assistant' };
    }
    if (this.speakerTracker.isBlocked()) {
      return { matched: false, confidence: 0, strategy: 'speaker-locked' };
    }

    const result = this.matcher.score(text);

    if (result.matched) {
      // First speaker to get past the threshold wins the lock
      if (this.speakerTracker.tryAcquire()) {
        this._setStatus('locked');
        this.onWakeWord?.(result.confidence, result);
      }
    }

    return result;
  }

  /**
   * Score a transcript without triggering any wake actions or acquiring
   * the speaker lock. Useful for debug UIs or logging.
   */
  score(text: string): MatchResult {
    return this.matcher.score(text);
  }

  // --- Speaker lock --------------------------------------------------------

  /**
   * Release the speaker lock when the command session ends and the assistant
   * is returning to idle. VoiceAssistant should call this inside `goIdle()`.
   */
  releaseLock(): void {
    this.speakerTracker.release();
  }

  // --- Config --------------------------------------------------------------

  getStatus():    WakeWordEngineStatus { return this.status; }
  getThreshold(): number               { return this.matcher.getThreshold(); }
  setThreshold(t: number): void        { this.matcher.setThreshold(t); }

  // --- Private -------------------------------------------------------------

  private _setStatus(s: WakeWordEngineStatus): void {
    if (this.status === s) return;
    this.status = s;
    this.onStatusChange?.(s);
  }
}

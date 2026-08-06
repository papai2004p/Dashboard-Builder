/**
 * RecognitionManager.ts
 *
 * Manages a single continuous SpeechRecognition session with:
 *  - Automatic restart on unexpected stop (exponential back-off, max 2 s)
 *  - Graceful pause / resume (used while the assistant speaks)
 *  - All alternatives collected for maximum wake-word sensitivity
 *  - Optimised for Indian English via `lang: 'en-IN'`
 *
 * A page reload is NEVER needed — the manager self-heals on every crash.
 */

export interface RecognitionManagerOptions {
  /** Recognition language. Default: 'en-IN' */
  language?: string;
  /** How many alternative transcripts to collect per result. Default: 3 */
  maxAlternatives?: number;
  /** Whether to emit interim (non-final) results. Default: true */
  interimResults?: boolean;
}

export interface RecognitionResult {
  /** Best-confidence transcript for this segment. */
  transcript: string;
  /** All alternative transcripts (includes the best at index 0). */
  alternatives: string[];
  /** True when the recognition engine has finalised this segment. */
  isFinal: boolean;
  /** Confidence score of the best transcript (0–1). May be 0 for interim. */
  confidence: number;
}

export class RecognitionManager {
  private rec: any       = null;
  private running        = false;
  private paused         = false;
  private restartDelay   = 150;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly lang:    string;
  private readonly maxAlts: number;
  private readonly interim: boolean;

  /** Fired for every recognition result (interim and final). */
  onResult?: (result: RecognitionResult) => void;
  /** Fired just before an auto-restart happens. */
  onRestart?: () => void;
  /** Fired when microphone access is permanently denied. */
  onPermissionDenied?: () => void;
  /** Fired when the browser has no SpeechRecognition support. */
  onUnsupported?: () => void;

  constructor(options: RecognitionManagerOptions = {}) {
    this.lang    = options.language        ?? 'en-IN';
    this.maxAlts = options.maxAlternatives ?? 3;
    this.interim = options.interimResults  ?? true;
  }

  /** Begin continuous listening. No-op if already running. */
  start(): void {
    if (this.running) return;
    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SR) { this.onUnsupported?.(); return; }

    this.running = true;
    this.paused  = false;
    this._attach(SR);
  }

  /** Stop listening permanently. Clears all timers. */
  stop(): void {
    this.running = false;
    this.paused  = false;
    if (this.restartTimer) { clearTimeout(this.restartTimer); this.restartTimer = null; }
    try { this.rec?.abort(); } catch { /* ignore */ }
    this.rec = null;
  }

  /**
   * Temporarily pause recognition (e.g. while the assistant is speaking).
   * The session is aborted rather than stopped so restart is faster.
   */
  pause(): void {
    if (this.paused) return;
    this.paused = true;
    if (this.restartTimer) { clearTimeout(this.restartTimer); this.restartTimer = null; }
    try { this.rec?.abort(); } catch { /* ignore */ }
  }

  /** Resume after a pause. Restarts the recognition session immediately. */
  resume(): void {
    if (!this.running || !this.paused) return;
    this.paused = false;
    try { this.rec?.start(); } catch { /* ignore — onend will restart */ }
  }

  isRunning(): boolean { return this.running; }
  isPaused():  boolean { return this.paused;  }

  // --- Private ---------------------------------------------------------------

  private _attach(SR: any): void {
    const rec = new SR();
    rec.lang            = this.lang;
    rec.continuous      = true;
    rec.interimResults  = this.interim;
    rec.maxAlternatives = this.maxAlts;
    this.rec = rec;

    rec.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const segment = e.results[i];
        // Collect all alternatives; pick highest-confidence as "best"
        let best = segment[0].transcript;
        let bestConf = (segment[0].confidence as number) ?? 0;
        const alts: string[] = [segment[0].transcript];
        for (let a = 1; a < segment.length; a++) {
          const alt = segment[a];
          alts.push(alt.transcript);
          const c = (alt.confidence as number) ?? 0;
          if (c > bestConf) { best = alt.transcript; bestConf = c; }
        }
        this.onResult?.({
          transcript:   best,
          alternatives: alts,
          isFinal:      segment.isFinal as boolean,
          confidence:   bestConf,
        });
      }
    };

    rec.onend = () => {
      if (!this.running || this.paused) return;
      this.onRestart?.();
      const delay = this.restartDelay;
      this.restartDelay = Math.min(delay * 1.5, 2_000);
      this.restartTimer = setTimeout(() => {
        this.restartDelay = 150;
        if (this.running && !this.paused) {
          try { rec.start(); } catch { /* ignore */ }
        }
      }, delay);
    };

    rec.onerror = (e: any) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        this.running = false;
        this.onPermissionDenied?.();
        return;
      }
      // Transient errors (no-speech, aborted, network) → let onend restart
    };

    if (!this.paused) {
      try { rec.start(); } catch { /* ignore */ }
    }
  }
}

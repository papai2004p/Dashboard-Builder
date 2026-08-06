/**
 * VoiceActivityDetector.ts
 *
 * Browser-based Voice Activity Detection using the Web Audio API AnalyserNode.
 * Measures RMS energy of the microphone stream and fires callbacks when speech
 * starts or ends — ignoring silence, keyboard sounds, fan noise, and other
 * low-level environmental noise.
 *
 * CPU cost: < 1 % when idle — driven by requestAnimationFrame, not setInterval.
 * The AnalyserNode runs on the audio thread; only the RMS calculation runs on
 * the main thread, once per animation frame (~16 ms).
 */

export interface VADOptions {
  /**
   * RMS energy threshold above which audio is considered speech (0–1).
   * Lower = more sensitive. Default: 0.012
   */
  energyThreshold?: number;

  /**
   * How long (ms) above threshold before we declare speech started.
   * Prevents very short sounds (clicks, pops) from triggering. Default: 80
   */
  speechDebounceMs?: number;

  /**
   * How long (ms) below threshold before we declare speech ended.
   * Prevents brief pauses (breaths, word gaps) from cutting off. Default: 400
   */
  silenceDebounceMs?: number;

  /**
   * Exponential smoothing factor for the energy estimate (0–1).
   * Higher = smoother but slower to react. Default: 0.90
   */
  smoothing?: number;
}

export class VoiceActivityDetector {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private dataArray: Float32Array = new Float32Array(0);

  private rafId = 0;
  private running = false;

  // State machine
  private smoothedEnergy = 0;
  private speechActive = false;
  private speechStartTime = 0;
  private silenceStartTime = 0;

  // Config
  private readonly energyThreshold: number;
  private readonly speechDebounceMs: number;
  private readonly silenceDebounceMs: number;
  private readonly smoothing: number;

  /** Fired once when speech energy is first detected. */
  onSpeechStart?: () => void;
  /** Fired once when sustained silence follows speech. */
  onSpeechEnd?: () => void;

  constructor(options: VADOptions = {}) {
    this.energyThreshold   = options.energyThreshold   ?? 0.012;
    this.speechDebounceMs  = options.speechDebounceMs  ?? 80;
    this.silenceDebounceMs = options.silenceDebounceMs ?? 400;
    this.smoothing         = options.smoothing         ?? 0.90;
  }

  /**
   * Attach the VAD to a live MediaStream.
   * Safe to call even if the browser doesn't support AudioContext —
   * VAD is best-effort and the engine continues without it.
   */
  connect(stream: MediaStream): void {
    this.disconnect();
    try {
      this.audioCtx = new AudioContext();
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.75;
      this.source = this.audioCtx.createMediaStreamSource(stream);
      this.source.connect(this.analyser);
      this.dataArray = new Float32Array(this.analyser.frequencyBinCount);
      this.running = true;
      this._loop();
    } catch {
      // AudioContext unavailable (e.g. browser policy) — VAD disabled silently
    }
  }

  /** Detach from the stream and release AudioContext resources. */
  disconnect(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    try { this.source?.disconnect(); } catch { /* ignore */ }
    try { this.audioCtx?.close(); } catch { /* ignore */ }
    this.audioCtx     = null;
    this.analyser     = null;
    this.source       = null;
    this.speechActive = false;
    this.smoothedEnergy  = 0;
    this.speechStartTime = 0;
    this.silenceStartTime = 0;
  }

  /** Returns true when speech is currently considered active. */
  isSpeechDetected(): boolean { return this.speechActive; }

  /** Current smoothed RMS energy (0–1). Useful for UI meters. */
  getSmoothedEnergy(): number { return this.smoothedEnergy; }

  // --- Private ---------------------------------------------------------------

  private _loop(): void {
    if (!this.running || !this.analyser) return;
    this.rafId = requestAnimationFrame(() => this._loop());

    this.analyser.getFloatTimeDomainData(this.dataArray);

    // Root-mean-square energy of this frame
    let sum = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      sum += this.dataArray[i] * this.dataArray[i];
    }
    const rms = Math.sqrt(sum / this.dataArray.length);

    // Exponential moving average for noise robustness
    this.smoothedEnergy = this.smoothing * this.smoothedEnergy + (1 - this.smoothing) * rms;

    const now      = performance.now();
    const isSpeech = this.smoothedEnergy > this.energyThreshold;

    if (isSpeech) {
      // Reset silence timer whenever sound is present
      this.silenceStartTime = 0;

      if (!this.speechActive) {
        // Start the speech onset debounce
        if (!this.speechStartTime) this.speechStartTime = now;
        if (now - this.speechStartTime >= this.speechDebounceMs) {
          this.speechActive = true;
          this.onSpeechStart?.();
        }
      }
    } else {
      // Reset speech onset timer whenever we're in silence
      this.speechStartTime = 0;

      if (this.speechActive) {
        // Start the silence debounce before declaring speech ended
        if (!this.silenceStartTime) this.silenceStartTime = now;
        if (now - this.silenceStartTime >= this.silenceDebounceMs) {
          this.speechActive     = false;
          this.silenceStartTime = 0;
          this.onSpeechEnd?.();
        }
      }
    }
  }
}

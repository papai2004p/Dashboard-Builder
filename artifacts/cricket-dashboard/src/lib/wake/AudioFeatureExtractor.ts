/**
 * AudioFeatureExtractor.ts
 *
 * Picovoice-style acoustic feature pipeline for the browser.
 *
 * Continuously analyses a live MediaStream using the Web Audio API AnalyserNode
 * and computes four complementary features that together let the engine
 * distinguish human speech from environmental noise:
 *
 *   RMS energy          — amplitude (is anything there?)
 *   Speech-band ratio   — 300-3 500 Hz energy / total energy
 *                         Speech: > 55 %  |  Fan/AC: < 40 %
 *   Spectral centroid   — "centre of mass" of the spectrum in Hz
 *                         Speech: 400-3 500 Hz  |  Music bass: < 200 Hz
 *   Zero-Crossing Rate  — sign changes per second in the time-domain signal
 *                         Fan/broadband: > 9 000/s  |  Pure hum: < 30/s
 *   Energy variance     — stability of RMS over the last ~0.5 s
 *                         Constant machines (fan, pump): very low variance
 *                         Natural speech: moderate variance
 *
 * CPU cost: < 1 % — runs entirely on requestAnimationFrame, never setInterval.
 * Memory:  two fixed-size typed arrays (freqData + timeData) reused every frame.
 */

export interface AudioFeatureExtractorOptions {
  /**
   * Minimum smoothed RMS to be considered "non-silence". Default: 0.007
   * Lower = more sensitive; raise if you have a very loud environment.
   */
  minEnergy?: number;
  /**
   * Minimum fraction of energy that must fall in the 300-3500 Hz speech band.
   * Default: 0.50  (50 %).
   */
  minSpeechBandRatio?: number;
}

export class AudioFeatureExtractor {
  // Web Audio objects
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;

  // Fixed-size typed arrays — allocated once, reused every frame
  private freqData: Uint8Array<ArrayBuffer>   = new Uint8Array(0)   as Uint8Array<ArrayBuffer>;
  private timeData: Float32Array<ArrayBuffer> = new Float32Array(0) as Float32Array<ArrayBuffer>;

  private rafId   = 0;
  private running = false;
  private sampleRate = 44_100;

  // ── Smoothed features (updated every animation frame) ────────────────────
  private _smoothRms         = 0;
  private _smoothSpeechRatio = 0;
  private _smoothZcr         = 0;
  private _smoothCentroid    = 0; // Hz

  // Energy-variance tracker — rolling window of ~0.5 s at 60 fps
  private _energyHistory: number[] = [];
  private _energyVariance          = 1; // initial high value = "don't block early"

  // Config
  private readonly minEnergy: number;
  private readonly minSpeechBandRatio: number;

  constructor(options: AudioFeatureExtractorOptions = {}) {
    this.minEnergy          = options.minEnergy          ?? 0.007;
    this.minSpeechBandRatio = options.minSpeechBandRatio ?? 0.50;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /**
   * Attach to a live MediaStream and begin feature extraction.
   * Safe to call even when AudioContext is unavailable — fails silently.
   */
  connect(stream: MediaStream): void {
    this.disconnect();
    try {
      this.audioCtx   = new AudioContext();
      this.sampleRate = this.audioCtx.sampleRate;

      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize               = 2048; // 1024 freq bins — good resolution
      this.analyser.smoothingTimeConstant = 0.50; // less smoothing = faster transient response

      this.source = this.audioCtx.createMediaStreamSource(stream);
      this.source.connect(this.analyser);

      const bins    = this.analyser.frequencyBinCount;
      this.freqData = new Uint8Array(bins)    as Uint8Array<ArrayBuffer>;
      this.timeData = new Float32Array(bins)  as Float32Array<ArrayBuffer>;

      this.running = true;
      this._loop();
    } catch {
      // AudioContext not supported (browser policy, sandboxed iframe, etc.)
    }
  }

  /** Detach from the stream and release all Web Audio resources. */
  disconnect(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    try { this.source?.disconnect(); } catch { /* ignore */ }
    try { this.audioCtx?.close();   } catch { /* ignore */ }
    this.audioCtx       = null;
    this.analyser       = null;
    this.source         = null;
    this._energyHistory = [];
    this._smoothRms         = 0;
    this._smoothSpeechRatio = 0;
    this._smoothZcr         = 0;
    this._smoothCentroid    = 0;
    this._energyVariance    = 1;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /** True when connected and producing data (not just constructed). */
  isConnected(): boolean { return this.running && this.analyser !== null; }

  /**
   * Multi-stage speech / noise discriminator.
   *
   * Returns true ONLY when all of these hold:
   *   Stage 1 — Enough energy to be non-silence
   *   Stage 2 — Speech frequency band dominates (vs. fan, music bass, hiss)
   *   Stage 3 — Spectral centroid is in the human-voice range
   *   Stage 4 — ZCR is neither too high (broadband noise) nor too low (hum)
   *   Stage 5 — Energy is not suspiciously constant (machine noise)
   *
   * When the extractor is not connected (getUserMedia denied) this always
   * returns `true` so recognition continues unfiltered.
   */
  isSpeechLike(): boolean {
    if (!this.isConnected()) return true; // no data — don't block

    // Stage 1: silence gate
    if (this._smoothRms < this.minEnergy) return false;

    // Stage 2: speech band ratio (300-3 500 Hz must dominate)
    if (this._smoothSpeechRatio < this.minSpeechBandRatio) return false;

    // Stage 3: spectral centroid in voice range
    // < 250 Hz → dominated by bass / room rumble
    // > 4 500 Hz → hiss / high-frequency noise
    if (this._smoothCentroid < 250 || this._smoothCentroid > 4_500) return false;

    // Stage 4: ZCR sanity
    // > 9 000 crossings/s → continuous broadband noise (fan, white noise)
    // < 30 crossings/s at appreciable volume → pure sine hum / buzzing
    if (this._smoothZcr > 9_000) return false;
    if (this._smoothZcr < 30 && this._smoothRms > 0.06) return false;

    // Stage 5: energy-variance — constant amplitude = machine source
    // Only apply when the history buffer is long enough and energy is meaningful
    if (
      this._energyHistory.length >= 15 &&
      this._smoothRms > 0.020 &&
      this._energyVariance < 0.000_004
    ) {
      return false; // almost perfectly constant energy → fan / pump motor
    }

    return true;
  }

  // Accessors for debug UIs or adaptive thresholds
  getSmoothedRms():       number { return this._smoothRms; }
  getSpeechBandRatio():   number { return this._smoothSpeechRatio; }
  getSpectralCentroid():  number { return this._smoothCentroid; }
  getZcr():               number { return this._smoothZcr; }
  getEnergyVariance():    number { return this._energyVariance; }

  // ── Private ───────────────────────────────────────────────────────────────

  private _loop(): void {
    if (!this.running || !this.analyser) return;
    this.rafId = requestAnimationFrame(() => this._loop());

    // ── Frequency domain ──────────────────────────────────────────────────
    this.analyser.getByteFrequencyData(this.freqData);

    const binCount  = this.freqData.length;
    const nyquist   = this.sampleRate / 2;
    const hzPerBin  = nyquist / binCount;

    let totalEnergy      = 0;
    let speechLowEnergy  = 0; // 300-1 000 Hz — voice fundamentals
    let speechHighEnergy = 0; // 1 000-3 500 Hz — harmonics, consonants
    let weightedSum      = 0; // for spectral centroid

    for (let i = 0; i < binCount; i++) {
      const hz = i * hzPerBin;
      const e  = (this.freqData[i] / 255) ** 2; // normalize + square for energy units
      totalEnergy += e;
      weightedSum += hz * e;
      if (hz >= 300  && hz <  1_000) speechLowEnergy  += e;
      if (hz >= 1_000 && hz <= 3_500) speechHighEnergy += e;
    }

    const speechBandEnergy = speechLowEnergy + speechHighEnergy;
    const speechRatio      = totalEnergy > 0 ? speechBandEnergy / totalEnergy : 0;
    const centroid         = totalEnergy > 0 ? weightedSum       / totalEnergy : 0;

    // ── Time domain ───────────────────────────────────────────────────────
    this.analyser.getFloatTimeDomainData(this.timeData);

    let sumSq         = 0;
    let zeroCrossings = 0;

    for (let i = 0; i < this.timeData.length; i++) {
      sumSq += this.timeData[i] * this.timeData[i];
      if (i > 0) {
        const a = this.timeData[i - 1];
        const b = this.timeData[i];
        if ((a >= 0) !== (b >= 0)) zeroCrossings++;
      }
    }

    const rms = Math.sqrt(sumSq / this.timeData.length);
    // Convert zero-crossings count to rate in crossings/second
    const zcr = (zeroCrossings / this.timeData.length) * this.sampleRate;

    // ── Energy variance (rolling ~0.5 s window at 60 fps) ────────────────
    this._energyHistory.push(rms);
    if (this._energyHistory.length > 30) this._energyHistory.shift();
    if (this._energyHistory.length >= 10) {
      const n    = this._energyHistory.length;
      const mean = this._energyHistory.reduce((a, b) => a + b, 0) / n;
      this._energyVariance = this._energyHistory.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
    }

    // ── Exponential smoothing (α = 0.85) ─────────────────────────────────
    const α = 0.85;
    this._smoothRms         = α * this._smoothRms         + (1 - α) * rms;
    this._smoothSpeechRatio = α * this._smoothSpeechRatio + (1 - α) * speechRatio;
    this._smoothZcr         = α * this._smoothZcr         + (1 - α) * zcr;
    this._smoothCentroid    = α * this._smoothCentroid    + (1 - α) * centroid;
  }
}

/**
 * SpeakerTracker.ts
 *
 * Prevents simultaneous or rapid-repeat wake-word triggers.
 * The first caller that wins `tryAcquire()` holds the lock; every
 * subsequent call is rejected until `release()` is called (or the
 * safety-valve timeout fires automatically).
 *
 * After release there is a short debounce window during which new
 * acquisitions are also blocked — this prevents the assistant's own
 * speech from immediately re-triggering itself.
 */

export interface SpeakerTrackerOptions {
  /**
   * Auto-release the lock after this many ms if `release()` is never
   * called (safety valve). Default: 8 000
   */
  lockTimeoutMs?: number;

  /**
   * Silence window (ms) after release before accepting a new lock.
   * Blocks re-trigger from assistant's own TTS tail. Default: 1 500
   */
  releaseDebounceMs?: number;
}

export class SpeakerTracker {
  private locked    = false;
  private debouncing = false;
  private lockTimer:     ReturnType<typeof setTimeout> | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly lockTimeoutMs: number;
  private readonly releaseDebounceMs: number;

  /** Fired when a lock is successfully acquired. */
  onLock?: () => void;
  /** Fired when the lock is released (before debounce starts). */
  onRelease?: () => void;

  constructor(options: SpeakerTrackerOptions = {}) {
    this.lockTimeoutMs    = options.lockTimeoutMs    ?? 8_000;
    this.releaseDebounceMs = options.releaseDebounceMs ?? 1_500;
  }

  /**
   * Try to acquire the speaker lock.
   * Returns `true` if acquired (caller is now the active speaker).
   * Returns `false` if already locked or in the debounce window.
   */
  tryAcquire(): boolean {
    if (this.locked || this.debouncing) return false;

    this.locked = true;
    this.onLock?.();

    // Safety valve — release automatically if the caller forgets
    this.lockTimer = setTimeout(() => this.release(), this.lockTimeoutMs);
    return true;
  }

  /**
   * Release the lock (call when the command session ends and the
   * assistant is ready to listen for the next wake word).
   */
  release(): void {
    if (!this.locked && !this.debouncing) return;

    if (this.lockTimer) { clearTimeout(this.lockTimer); this.lockTimer = null; }
    this.locked = false;
    this.onRelease?.();

    // Brief debounce before allowing a new acquisition
    this.debouncing = true;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debouncing = false;
    }, this.releaseDebounceMs);
  }

  isLocked(): boolean     { return this.locked; }
  isDebouncing(): boolean { return this.debouncing; }
  isBlocked(): boolean    { return this.locked || this.debouncing; }

  /** Clean up all timers. Call when the engine is destroyed. */
  destroy(): void {
    if (this.lockTimer)     clearTimeout(this.lockTimer);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.lockTimer     = null;
    this.debounceTimer = null;
  }
}

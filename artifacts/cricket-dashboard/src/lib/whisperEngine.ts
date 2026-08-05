/**
 * whisperEngine.ts
 *
 * Runs OpenAI Whisper entirely in the browser via @huggingface/transformers
 * (ONNX-WASM backend).  No API key, no server.
 *
 * Model:   Xenova/whisper-tiny.en  (~39 MB quantised)
 *          Downloaded once, then cached in the browser's Origin-Private
 *          FileSystem (OPFS / cache-API) — instant on subsequent loads.
 *
 * Accuracy: far better than the Web Speech API for accented speech,
 *           short commands, and quiet microphones.
 */

import { pipeline, env } from '@huggingface/transformers';

// ─── Static model config ─────────────────────────────────────────────────────

env.allowLocalModels = false;
env.useBrowserCache  = true;    // IndexedDB / cache-API persistence

const MODEL_ID = 'Xenova/whisper-tiny.en';

// ─── Types ────────────────────────────────────────────────────────────────────

export type WhisperStatus =
  | 'idle'          // not yet requested
  | 'loading'       // downloading / initialising model
  | 'ready'         // model warm, ready to transcribe
  | 'transcribing'  // actively running inference
  | 'error';        // fatal error

// ─── Module-level pipeline singleton (shared across re-renders) ───────────────

type ASRPipeline = Awaited<ReturnType<typeof pipeline>>;

let _pipe: ASRPipeline | null = null;
let _loading = false;
const _waiters: Array<(p: ASRPipeline) => void> = [];
const _rejecters: Array<(e: unknown) => void>    = [];

// ─── WhisperEngine class ──────────────────────────────────────────────────────

export class WhisperEngine {
  private _onStatus:   (s: WhisperStatus) => void;
  private _onProgress: (pct: number)      => void;

  constructor(
    onStatus:   (s: WhisperStatus) => void,
    onProgress: (pct: number)      => void,
  ) {
    this._onStatus   = onStatus;
    this._onProgress = onProgress;
  }

  /** Returns true once the model is loaded and warm. */
  isReady(): boolean { return _pipe !== null; }

  /**
   * Pre-load the model (call this when the user selects Whisper/Hybrid
   * so inference feels instant the first time they speak).
   */
  async load(): Promise<void> {
    if (_pipe) {
      this._onStatus('ready');
      this._onProgress(100);
      return;
    }
    this._onStatus('loading');
    this._onProgress(0);
    await this._getPipe();
    this._onStatus('ready');
    this._onProgress(100);
  }

  /**
   * Transcribe an audio Blob (any format the browser can decode — webm, ogg,
   * wav, mp4/aac) and return the English text.
   */
  async transcribe(blob: Blob): Promise<string> {
    this._onStatus('transcribing');
    try {
      const pipe = await this._getPipe();

      // Decode to 16 kHz mono Float32Array (Whisper's expected input)
      const arrayBuf = await blob.arrayBuffer();
      const audioCtx = new AudioContext({ sampleRate: 16_000 });
      let audioBuf: AudioBuffer;
      try {
        audioBuf = await audioCtx.decodeAudioData(arrayBuf);
      } finally {
        audioCtx.close();
      }

      const float32 = audioBuf.getChannelData(0);   // mono channel 0

      const result: any = await (pipe as any)(float32, {
        sampling_rate: 16_000,
        return_timestamps: false,
        language: 'english',
        task: 'transcribe',
      });

      this._onStatus('ready');
      return (result?.text ?? '').trim();

    } catch (err) {
      console.error('[WhisperEngine] transcribe error', err);
      this._onStatus('error');
      throw err;
    }
  }

  /** No-op — pipeline is module-global and persists across instances. */
  dispose(): void {}

  // ── Private ─────────────────────────────────────────────────────────────────

  private _getPipe(): Promise<ASRPipeline> {
    if (_pipe) return Promise.resolve(_pipe);

    if (_loading) {
      return new Promise<ASRPipeline>((resolve, reject) => {
        _waiters.push(resolve);
        _rejecters.push(reject);
      });
    }

    _loading = true;

    return pipeline(
      'automatic-speech-recognition',
      MODEL_ID,
      {
        progress_callback: (info: any) => {
          // info shape: { status: 'download', loaded: N, total: N, ... }
          if (info?.status === 'download' && info.total > 0) {
            const pct = Math.round((info.loaded / info.total) * 100);
            this._onProgress(Math.min(pct, 99)); // hold at 99 until fully loaded
          }
        },
        dtype: 'q8',         // 8-bit quantised weights — ~half the download size
        device: 'wasm' as any,
      },
    ).then((p) => {
      _pipe    = p as ASRPipeline;
      _loading = false;
      _waiters.forEach(r => r(_pipe!));
      _waiters.length   = 0;
      _rejecters.length = 0;
      return _pipe;
    }).catch((err) => {
      _loading = false;
      _rejecters.forEach(r => r(err));
      _waiters.length   = 0;
      _rejecters.length = 0;
      throw err;
    }) as Promise<ASRPipeline>;
  }
}

// ─── Audio recording helpers ─────────────────────────────────────────────────

/** Pick the best supported mimeType for MediaRecorder. */
function bestMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
  ];
  return candidates.find(t => MediaRecorder.isTypeSupported(t)) ?? '';
}

export interface Recorder {
  /** Stop recording and resolve with the audio Blob. */
  stop: () => Promise<Blob | null>;
}

/**
 * Start recording microphone audio.
 * Returns a `Recorder` whose `.stop()` yields the captured Blob.
 */
export async function startMicRecording(): Promise<Recorder> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, sampleRate: 16_000, echoCancellation: true, noiseSuppression: true },
    video: false,
  });

  const mimeType = bestMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: Blob[] = [];

  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  recorder.start(200);   // collect chunks every 200 ms

  const stop = (): Promise<Blob | null> =>
    new Promise((resolve) => {
      if (recorder.state === 'inactive') {
        stream.getTracks().forEach(t => t.stop());
        resolve(null);
        return;
      }
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        if (!chunks.length) { resolve(null); return; }
        resolve(new Blob(chunks, { type: mimeType || 'audio/webm' }));
      };
      recorder.stop();
    });

  return { stop };
}
